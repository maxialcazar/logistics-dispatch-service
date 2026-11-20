import { apiClient } from './apiClient';

export interface AppDriver {
  id: string;
  name: string;
  user?: {
    username: string;
  };
  zones?: {
    id: string;
    name: string;
  }[];
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

export const driverService = {
  async getDrivers(token: string, page = 1, limit = 100): Promise<PaginatedResponse<AppDriver>> {
    const query = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    return apiClient.get<PaginatedResponse<AppDriver>>(`/api/drivers?${query.toString()}`, { token });
  },

  async createDriver(
    token: string,
    data: { name: string; username: string; password: string }
  ): Promise<AppDriver> {
    return apiClient.post<AppDriver>('/api/drivers', data, { token });
  },

  async assignZones(token: string, driverId: string, zoneIds: string[]) {
    return apiClient.post(`/api/drivers/${encodeURIComponent(driverId)}/zones`, { zoneIds }, { token });
  },

  async updateLocation(token: string, lat: number, lng: number) {
    return apiClient.patch('/api/drivers/location', { lat, lng }, { token });
  },
};
