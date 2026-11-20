import { apiClient } from './apiClient';

interface Zone {
  id: string;
  name: string;
}

// Update types to match new backend schema
export interface Package {
  id: string;
  trackingCode: string;
  recipientName: string;
  recipientAddress: string;
  recipientPhone: string;
  status: 'pending' | 'assigned' | 'in_transit' | 'delivered' | 'cancelled';
  zoneId: string;
  zone?: Zone;
  lat?: number;
  lng?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePackageInput {
  trackingCode: string;
  recipientName: string;
  recipientAddress: string;
  recipientPhone?: string;
  senderName?: string;
  senderAddress?: string;
  senderPhone?: string;
  addressReferences?: string;
  addressStreet?: string;
  addressNumber?: string;
  addressFloor?: string;
  addressCity?: string;
  addressZip?: string;
  zoneId: string;
  lat?: number | null;
  lng?: number | null;
  weight?: number | null;
  volume?: number | null;
  deliveryWindowStart?: string | null;
  deliveryWindowEnd?: string | null;
}

export interface DashboardStats {
  deliveredToday: number;
  inTransit: number;
  avgDeliveryTimeMinutes: number;
  zoneDistribution: { name: string; value: number }[];
  weeklyActivity: { date: string; delivered: number; failed: number }[];
  topDrivers: { name: string; delivered: number; efficiency: number }[];
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

export const packageService = {
  async getZones(token: string): Promise<Zone[]> {
    const data = await apiClient.get<PaginatedResponse<Zone>>('/api/zones?limit=100', { token });
    return data.items || [];
  },

  async createZone(token: string, name: string): Promise<Zone> {
    return apiClient.post<Zone>('/api/zones', { name }, { token });
  },

  async createPackage(token: string, data: CreatePackageInput): Promise<Package> {
    return apiClient.post<Package>('/api/packages', data, { token });
  },

  async getPackages(
    token: string,
    status?: string,
    page = 1,
    limit = 10,
    isArchived = false,
    search?: string,
    signal?: AbortSignal
  ): Promise<PaginatedResponse<Package>> {
    const query = new URLSearchParams();
    if (status) query.append('status', status);
    query.append('page', page.toString());
    query.append('limit', limit.toString());
    query.append('isArchived', isArchived.toString());
    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      query.append('search', normalizedSearch.slice(0, 200));
    }

    return apiClient.get<PaginatedResponse<Package>>(`/api/packages?${query.toString()}`, {
      token,
      signal,
    });
  },

  async getDashboardStats(token: string): Promise<DashboardStats> {
    return apiClient.get<DashboardStats>('/api/packages/stats', { token });
  },

  async archivePackages(token: string, packageIds: string[]) {
    return apiClient.post('/api/packages/archive', { packageIds }, { token });
  },

  async deletePackages(token: string, packageIds: string[]) {
    return apiClient.post('/api/packages/delete', { packageIds }, { token });
  },

  // Driver Methods
  async getMyPackages(token: string): Promise<Package[]> {
    return apiClient.get<Package[]>('/api/packages/my-packages', { token });
  },

  async updateStatus(
    token: string,
    packageId: string,
    status: string,
    lat?: number,
    lng?: number,
    signature?: string,
    photo?: string
  ) {
    return apiClient.patch(
      `/api/packages/${encodeURIComponent(packageId)}/status`,
      {
        status,
        lat,
        lng,
        ...(signature && { signature }),
        ...(photo && { photo }),
      },
      { token }
    );
  },
};
