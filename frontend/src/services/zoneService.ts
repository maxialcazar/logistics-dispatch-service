import { apiClient } from './apiClient';

export interface Zone {
  id: string;
  name: string;
  coordinates: { lat: number; lng: number }[]; // Array of points forming a polygon
  description?: string;
  isActive: boolean;
  driver?: { id: string; name: string };
  createdAt: string;
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

  async updateZone(
    token: string,
    id: string,
    data: { isActive?: boolean; driverId?: string | null; description?: string }
  ): Promise<Zone> {
    return apiClient.patch<Zone>(`/api/zones/${encodeURIComponent(id)}`, data, { token });
  },

  async createZone(
    token: string,
    data: { name: string; coordinates: { lat: number; lng: number }[]; description?: string }
  ): Promise<Zone> {
    return apiClient.post<Zone>('/api/zones', data, { token });
  },

  async deleteZone(token: string, id: string): Promise<boolean> {
    await apiClient.delete(`/api/zones/${encodeURIComponent(id)}`, { token });
    return true;
  },

  async setAllZonesStatus(token: string, isActive: boolean) {
    return apiClient.post('/api/zones/bulk-status', { isActive }, { token });
  },
};
