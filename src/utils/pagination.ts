export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginationOptions {
  defaultPage?: number;
  defaultLimit?: number;
  maxLimit?: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

function parseQueryInt(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : Number.NaN;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return Number.NaN;
}

/**
 * Sanitizes pagination query parameters (`page` and `limit`) into bounded positive integers.
 */
export function sanitizePagination(
  query: { page?: unknown; limit?: unknown } = {},
  options: PaginationOptions = {}
): PaginationParams {
  const defaultPage = Math.max(1, options.defaultPage ?? DEFAULT_PAGE);
  const maxLimit = Math.max(1, options.maxLimit ?? MAX_LIMIT);
  const defaultLimit = Math.min(maxLimit, Math.max(1, options.defaultLimit ?? DEFAULT_LIMIT));

  const parsedPage = parseQueryInt(query?.page);
  const parsedLimit = parseQueryInt(query?.limit);

  return {
    page: Math.max(1, parsedPage || defaultPage),
    limit: Math.min(maxLimit, Math.max(1, parsedLimit || defaultLimit)),
  };
}
