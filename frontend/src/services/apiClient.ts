const TOKEN_STORAGE_KEY = 'token';
const USER_STORAGE_KEY = 'user';
const LOGIN_PATH = '/login';

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;
let isRedirectingToLogin = false;

export class ApiError extends Error {
  public readonly status: number;
  public readonly data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  token?: string | null;
  skipAuthHandler?: boolean;
}

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

function normalizeBaseUrl(rawUrl: string | undefined): string {
  if (!rawUrl) {
    return '';
  }
  return rawUrl.trim().replace(/\/+$/, '');
}

const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_URL);

export interface BlobDownloadResult {
  blob: Blob;
  filename: string | null;
}

export function resolveApiAssetUrl(assetPath?: string | null): string | null {
  if (!assetPath) {
    return null;
  }

  const trimmed = assetPath.trim();
  if (!trimmed) {
    return null;
  }

  if (/^(https?:|data:|blob:)/i.test(trimmed)) {
    return trimmed;
  }

  const normalizedPath = `/${trimmed.replace(/^\/+/, '')}`;
  if (!API_BASE_URL) {
    return normalizedPath;
  }

  if (
    normalizedPath === '/api' ||
    normalizedPath.startsWith('/api/') ||
    normalizedPath.startsWith('/api?')
  ) {
    return buildApiUrl(normalizedPath);
  }

  const originBase = API_BASE_URL.endsWith('/api')
    ? API_BASE_URL.slice(0, -4)
    : API_BASE_URL;

  return `${originBase}${normalizedPath}`;
}

export function buildApiUrl(endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }

  const normalizedEndpoint = `/${endpoint.replace(/^\/+/, '')}`;

  if (!API_BASE_URL) {
    return normalizedEndpoint;
  }

  // Avoid duplicating /api when VITE_API_URL already ends with /api
  if (
    API_BASE_URL.endsWith('/api') &&
    (normalizedEndpoint === '/api' ||
      normalizedEndpoint.startsWith('/api/') ||
      normalizedEndpoint.startsWith('/api?'))
  ) {
    return `${API_BASE_URL.slice(0, -4)}${normalizedEndpoint}`;
  }

  return `${API_BASE_URL}${normalizedEndpoint}`;
}

function getStoredToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function clearStoredSession(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    // Ignore storage errors in restricted environments
  }
}

function isOnLoginPage(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  return pathname === LOGIN_PATH;
}

function isAuthLoginEndpoint(url: string): boolean {
  const pathWithoutQuery = url.split(/[?#]/)[0].replace(/\/+$/, '');
  return pathWithoutQuery === '/api/auth/login' || pathWithoutQuery.endsWith('/api/auth/login');
}

function handleUnauthorized(): void {
  clearStoredSession();
  unauthorizedHandler?.();

  if (typeof window !== 'undefined' && !isOnLoginPage() && !isRedirectingToLogin) {
    isRedirectingToLogin = true;
    window.location.replace(LOGIN_PATH);
    window.setTimeout(() => {
      isRedirectingToLogin = false;
    }, 1000);
  }
}

function isRawBodyInit(value: unknown): value is BodyInit {
  if (typeof value === 'string') return true;
  if (typeof FormData !== 'undefined' && value instanceof FormData) return true;
  if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) return true;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true;
  if (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream) return true;
  return false;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) {
    return undefined;
  }

  if (response.headers.get('content-length') === '0') {
    return undefined;
  }

  const rawText = await response.text();
  if (!rawText.trim()) {
    return undefined;
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const expectsJson =
    contentType.includes('application/json') || contentType.includes('+json');

  try {
    return JSON.parse(rawText);
  } catch {
    if (expectsJson && response.ok) {
      throw new ApiError('Invalid JSON response from server', response.status, rawText);
    }
    return rawText;
  }
}

function extractErrorMessage(data: unknown, status: number, statusText: string): string {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (typeof record.error === 'string' && record.error.trim()) {
      return record.error;
    }
    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message;
    }
  }

  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (trimmed && !trimmed.startsWith('<')) {
      return trimmed;
    }
  }

  return statusText ? `Error ${status}: ${statusText}` : `Error ${status}`;
}

function extractFilenameFromDisposition(headerValue: string | null): string | null {
  if (!headerValue) return null;

  const utf8Match = /filename\*=UTF-8''([^;\s]+)/i.exec(headerValue);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].replace(/["']/g, ''));
    } catch {
      return utf8Match[1].replace(/["']/g, '');
    }
  }

  const quotedMatch = /filename="([^"]+)"/i.exec(headerValue);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const plainMatch = /filename=([^;\s]+)/i.exec(headerValue);
  return plainMatch?.[1]?.replace(/["']/g, '') ?? null;
}

async function performFetch(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<Response> {
  const { body, token, skipAuthHandler = false, ...fetchOptions } = options;
  const url = buildApiUrl(endpoint);
  const headers = new Headers(fetchOptions.headers);

  if (!headers.has('Authorization')) {
    const authToken = token === undefined ? getStoredToken() : token;
    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }
  }

  let resolvedBody: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      headers.delete('Content-Type');
      resolvedBody = body;
    } else if (isRawBodyInit(body)) {
      resolvedBody = body;
      if (typeof body === 'string' && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
    } else {
      resolvedBody = JSON.stringify(body);
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
    }
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
    body: resolvedBody,
  });

  if (response.status === 401 && !skipAuthHandler && !isAuthLoginEndpoint(url)) {
    handleUnauthorized();
  }

  return response;
}

async function request<T = unknown>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const response = await performFetch(endpoint, options);
  const data = await parseResponseBody(response);

  if (!response.ok) {
    const message = extractErrorMessage(data, response.status, response.statusText);
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

async function getBlob(
  endpoint: string,
  options: Omit<ApiRequestOptions, 'method' | 'body'> = {}
): Promise<BlobDownloadResult> {
  const response = await performFetch(endpoint, { ...options, method: 'GET' });

  if (!response.ok) {
    const data = await parseResponseBody(response);
    const message = extractErrorMessage(data, response.status, response.statusText);
    throw new ApiError(message, response.status, data);
  }

  const blob = await response.blob();
  const filename = extractFilenameFromDisposition(response.headers.get('content-disposition'));
  return { blob, filename };
}

export const apiClient = {
  request,
  getBlob,

  get<T = unknown>(
    endpoint: string,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>
  ): Promise<T> {
    return request<T>(endpoint, { ...options, method: 'GET' });
  },

  post<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>
  ): Promise<T> {
    return request<T>(endpoint, { ...options, method: 'POST', body });
  },

  put<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>
  ): Promise<T> {
    return request<T>(endpoint, { ...options, method: 'PUT', body });
  },

  patch<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>
  ): Promise<T> {
    return request<T>(endpoint, { ...options, method: 'PATCH', body });
  },

  delete<T = unknown>(
    endpoint: string,
    options?: Omit<ApiRequestOptions, 'method'>
  ): Promise<T> {
    return request<T>(endpoint, { ...options, method: 'DELETE' });
  },
};
