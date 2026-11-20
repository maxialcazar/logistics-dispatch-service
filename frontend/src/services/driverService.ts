import { apiClient } from './apiClient';
import type { Package } from './packageService';

export interface DriverZoneSummary {
  id: string;
  name: string;
  isActive?: boolean;
}

export interface AppDriver {
  id: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  isOnline?: boolean;
  lastSeenAt?: string | null;
  lastLocationAt?: string | null;
  user?: {
    id?: string;
    username: string;
    role?: string;
  };
  zones?: DriverZoneSummary[];
  createdAt: string;
  updatedAt?: string;
}

export interface DriverDetail extends AppDriver {
  assignedPackagesCount?: number;
  packages: Package[];
}

export interface UpdateDriverInput {
  name?: string;
  username?: string;
  password?: string;
  lat?: number | null;
  lng?: number | null;
}

export interface DeleteDriverResponse {
  ok?: boolean;
  deletedDriverId?: string;
  id?: string;
  message?: string;
  revertedCount?: number;
  unlinkedZoneCount?: number;
}

interface PaginatedResponse<T> {
  items: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readOptionalFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function normalizeDriverSummary(raw: unknown): AppDriver {
  const root = isRecord(raw) ? raw : {};
  const base = isRecord(root.driver) ? root.driver : root;
  const onlineStatus = isRecord(root.onlineStatus)
    ? root.onlineStatus
    : isRecord(base.onlineStatus)
      ? base.onlineStatus
      : null;

  const rawUser = isRecord(base.user) ? base.user : isRecord(root.user) ? root.user : null;
  const rawZones = Array.isArray(base.zones)
    ? base.zones
    : Array.isArray(root.zones)
      ? root.zones
      : [];

  const isOnline =
    typeof base.isOnline === 'boolean'
      ? base.isOnline
      : typeof root.isOnline === 'boolean'
        ? root.isOnline
        : typeof base.online === 'boolean'
          ? base.online
          : typeof root.online === 'boolean'
            ? root.online
            : typeof onlineStatus?.isOnline === 'boolean'
              ? onlineStatus.isOnline
              : undefined;

  const lastSeenAt =
    readOptionalString(base.lastSeenAt) ??
    readOptionalString(root.lastSeenAt) ??
    readOptionalString(base.lastLocationAt) ??
    readOptionalString(root.lastLocationAt) ??
    readOptionalString(base.lastActivityAt) ??
    readOptionalString(root.lastActivityAt) ??
    readOptionalString(onlineStatus?.lastSeenAt) ??
    readOptionalString(onlineStatus?.timestamp);

  return {
    id: typeof base.id === 'string' ? base.id : '',
    name: typeof base.name === 'string' ? base.name : '',
    lat:
      readOptionalFiniteNumber(base.lat) ??
      readOptionalFiniteNumber(root.lat) ??
      readOptionalFiniteNumber(onlineStatus?.lat),
    lng:
      readOptionalFiniteNumber(base.lng) ??
      readOptionalFiniteNumber(root.lng) ??
      readOptionalFiniteNumber(onlineStatus?.lng),
    isOnline,
    lastSeenAt,
    lastLocationAt:
      readOptionalString(base.lastLocationAt) ?? readOptionalString(root.lastLocationAt),
    user: rawUser
      ? {
          id: typeof rawUser.id === 'string' ? rawUser.id : undefined,
          username: typeof rawUser.username === 'string' ? rawUser.username : '',
          role: typeof rawUser.role === 'string' ? rawUser.role : undefined,
        }
      : undefined,
    zones: rawZones
      .filter(isRecord)
      .map((zone) => ({
        id: typeof zone.id === 'string' ? zone.id : '',
        name: typeof zone.name === 'string' ? zone.name : 'Sin nombre',
        isActive: typeof zone.isActive === 'boolean' ? zone.isActive : undefined,
      }))
      .filter((zone) => zone.id.length > 0),
    createdAt: typeof base.createdAt === 'string' ? base.createdAt : '',
    updatedAt: typeof base.updatedAt === 'string' ? base.updatedAt : undefined,
  };
}

function normalizeDriverDetail(raw: unknown): DriverDetail {
  const summary = normalizeDriverSummary(raw);
  const root = isRecord(raw) ? raw : {};
  const base = isRecord(root.driver) ? root.driver : root;

  const rawPackages = Array.isArray(base.packages)
    ? base.packages
    : Array.isArray(root.packages)
      ? root.packages
      : Array.isArray(base.assignedPackages)
        ? base.assignedPackages
        : Array.isArray(root.assignedPackages)
          ? root.assignedPackages
          : Array.isArray(base.activePackages)
            ? base.activePackages
            : Array.isArray(root.activePackages)
              ? root.activePackages
              : [];

  const packages = rawPackages
    .filter(isRecord)
    .filter((pkg) => typeof pkg.id === 'string' && typeof pkg.trackingCode === 'string')
    .map((pkg) => pkg as unknown as Package);

  const countCandidate =
    readOptionalFiniteNumber(root.assignedPackagesCount) ??
    readOptionalFiniteNumber(base.assignedPackagesCount);

  return {
    ...summary,
    assignedPackagesCount: countCandidate ?? packages.length,
    packages,
  };
}

export const driverService = {
  async getDrivers(
    token: string,
    page = 1,
    limit = 100,
    signal?: AbortSignal
  ): Promise<PaginatedResponse<AppDriver>> {
    const query = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    return apiClient.get<PaginatedResponse<AppDriver>>(`/api/drivers?${query.toString()}`, {
      token,
      signal,
    });
  },

  async getDriverById(
    token: string,
    id: string,
    signal?: AbortSignal
  ): Promise<DriverDetail> {
    const raw = await apiClient.get<unknown>(`/api/drivers/${encodeURIComponent(id)}`, {
      token,
      signal,
    });
    return normalizeDriverDetail(raw);
  },

  async createDriver(
    token: string,
    data: { name: string; username: string; password: string }
  ): Promise<AppDriver> {
    return apiClient.post<AppDriver>('/api/drivers', data, { token });
  },

  async updateDriver(
    token: string,
    id: string,
    data: UpdateDriverInput
  ): Promise<AppDriver> {
    const raw = await apiClient.patch<unknown>(
      `/api/drivers/${encodeURIComponent(id)}`,
      data,
      { token }
    );
    return normalizeDriverSummary(raw);
  },

  async deleteDriver(token: string, id: string): Promise<DeleteDriverResponse> {
    return apiClient.delete<DeleteDriverResponse>(`/api/drivers/${encodeURIComponent(id)}`, {
      token,
    });
  },

  async assignZones(token: string, driverId: string, zoneIds: string[]) {
    return apiClient.post(`/api/drivers/${encodeURIComponent(driverId)}/zones`, { zoneIds }, { token });
  },

  async updateLocation(token: string, lat: number, lng: number) {
    return apiClient.patch('/api/drivers/location', { lat, lng }, { token });
  },
};
