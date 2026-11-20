import { apiClient } from './apiClient';

export interface CreateDispatcherInput {
  username: string;
  password: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface CompanyProfile {
  id: string;
  name: string;
  slug: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateCompanyInput {
  name?: string;
  slug?: string;
}

export interface TeamUser {
  id: string;
  username: string;
  role: string;
  createdAt?: string;
}

export interface GetUsersParams {
  role?: 'admin' | 'dispatcher' | 'driver';
  search?: string;
  page?: number;
  limit?: number;
  signal?: AbortSignal;
}

export interface UsersListResponse {
  items: TeamUser[];
  total: number;
}

function normalizeTeamUser(raw: unknown): TeamUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const id = typeof rec.id === 'string' || typeof rec.id === 'number' ? String(rec.id) : '';
  const username = typeof rec.username === 'string' ? rec.username : '';
  const role = typeof rec.role === 'string' ? rec.role : '';
  if (!id || !username || !role) return null;
  return {
    id,
    username,
    role,
    createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : undefined,
  };
}

function parseUsersResponse(raw: unknown): UsersListResponse {
  if (Array.isArray(raw)) {
    const items = raw.map(normalizeTeamUser).filter((u): u is TeamUser => u !== null);
    return { items, total: items.length };
  }

  if (raw && typeof raw === 'object') {
    const rec = raw as Record<string, unknown>;
    const candidate = rec.items ?? rec.users ?? rec.data;
    const rawItems = Array.isArray(candidate) ? candidate : [];
    const items = rawItems.map(normalizeTeamUser).filter((u): u is TeamUser => u !== null);
    const meta = rec.meta && typeof rec.meta === 'object' ? (rec.meta as Record<string, unknown>) : null;
    const total = typeof meta?.total === 'number' ? meta.total : items.length;
    return { items, total };
  }

  return { items: [], total: 0 };
}

export const userService = {
  async createDispatcher(token: string, data: CreateDispatcherInput): Promise<TeamUser> {
    return apiClient.post<TeamUser>('/api/users', { ...data, role: 'dispatcher' }, { token });
  },

  async changePassword(token: string, data: ChangePasswordInput): Promise<void> {
    await apiClient.put<void>('/api/users/password', data, { token });
  },

  async getCompany(token: string, signal?: AbortSignal): Promise<CompanyProfile> {
    return apiClient.get<CompanyProfile>('/api/company', { token, signal });
  },

  async updateCompany(token: string, data: UpdateCompanyInput): Promise<CompanyProfile> {
    return apiClient.patch<CompanyProfile>('/api/company', data, { token });
  },

  async getUsers(token: string, params: GetUsersParams = {}): Promise<UsersListResponse> {
    const query = new URLSearchParams();
    if (params.role) query.set('role', params.role);
    if (params.search?.trim()) query.set('search', params.search.trim());
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    const qs = query.toString();

    const raw = await apiClient.get<unknown>(`/api/users${qs ? `?${qs}` : ''}`, {
      token,
      signal: params.signal,
    });
    return parseUsersResponse(raw);
  },

  async deleteUser(token: string, userId: string): Promise<void> {
    await apiClient.delete<void>(`/api/users/${encodeURIComponent(userId)}`, { token });
  },
};
