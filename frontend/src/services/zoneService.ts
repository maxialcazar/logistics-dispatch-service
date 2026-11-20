import { apiClient } from './apiClient';

/** GeoJSON coordinate pair in backend [longitude, latitude] order */
export type GeoJsonCoord = [number, number];

export interface ZoneCoordinate {
  lat: number;
  lng: number;
}

export interface ZonePackageCounts {
  pending: number;
  assigned: number;
  in_transit: number;
  delivered: number;
  cancelled: number;
  total: number;
}

export interface Zone {
  id: string;
  name: string;
  polygon?: GeoJsonCoord[] | null;
  coordinates?: ZoneCoordinate[] | null;
  description?: string | null;
  isActive: boolean;
  driverId?: string | null;
  driver?: {
    id: string;
    name: string;
    user?: { username: string };
  } | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ZoneDetail extends Zone {
  packageCounts?: ZonePackageCounts;
}

export interface CreateZonePayload {
  name: string;
  description?: string;
  polygon?: GeoJsonCoord[];
}

export interface UpdateZonePayload {
  name?: string;
  description?: string;
  isActive?: boolean;
  driverId?: string | null;
  polygon?: GeoJsonCoord[] | null;
}

export interface DeleteZoneResponse {
  ok: boolean;
  deletedZoneId: string;
  revertedPackageIds: string[];
  revertedCount: number;
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

export const zoneService = {
  async getZones(
    token: string,
    page = 1,
    limit = 100,
    signal?: AbortSignal
  ): Promise<PaginatedResponse<Zone>> {
    const query = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    return apiClient.get<PaginatedResponse<Zone>>(`/api/zones?${query.toString()}`, {
      token,
      signal,
    });
  },

  async getZoneById(
    token: string,
    id: string,
    signal?: AbortSignal
  ): Promise<ZoneDetail> {
    return apiClient.get<ZoneDetail>(`/api/zones/${encodeURIComponent(id)}`, {
      token,
      signal,
    });
  },

  async updateZone(
    token: string,
    id: string,
    data: UpdateZonePayload
  ): Promise<Zone> {
    return apiClient.patch<Zone>(`/api/zones/${encodeURIComponent(id)}`, data, { token });
  },

  async createZone(token: string, data: CreateZonePayload): Promise<Zone> {
    return apiClient.post<Zone>('/api/zones', data, { token });
  },

  async deleteZone(token: string, id: string): Promise<DeleteZoneResponse> {
    return apiClient.delete<DeleteZoneResponse>(`/api/zones/${encodeURIComponent(id)}`, {
      token,
    });
  },

  async setAllZonesStatus(token: string, isActive: boolean) {
    return apiClient.post('/api/zones/bulk-status', { isActive }, { token });
  },
};
