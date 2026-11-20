import { apiClient, resolveApiAssetUrl, type BlobDownloadResult } from './apiClient';
import type { PackageStatus } from '../utils/packageStatus';

interface Zone {
  id: string;
  name: string;
}

export interface PackageDriverSummary {
  id: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
}

export interface PackageZoneDetail {
  id: string;
  name: string;
  isActive?: boolean;
  driverId?: string | null;
  driver?: PackageDriverSummary | null;
}

export interface PackageHistoryEntry {
  id: string;
  packageId?: string;
  status: PackageStatus | string;
  userId?: string | null;
  user?: {
    id: string;
    username: string;
    role?: string;
  } | null;
  notes?: string | null;
  createdAt: string;
}

// Update types to match new backend schema
export interface Package {
  id: string;
  trackingCode: string;
  recipientName: string;
  recipientAddress: string;
  recipientPhone: string;
  recipientEmail?: string;
  addressStreet?: string;
  addressNumber?: string;
  addressFloor?: string;
  addressCity?: string;
  addressZip?: string;
  addressReferences?: string;
  senderName?: string;
  senderAddress?: string;
  senderPhone?: string;
  status: PackageStatus;
  zoneId: string;
  zone?: Zone;
  driverId?: string;
  driver?: PackageDriverSummary;
  lat?: number;
  lng?: number;
  weight?: number;
  volume?: number;
  estimatedDeliveryAt?: string;
  deliveryWindowStart?: string;
  deliveryWindowEnd?: string;
  signatureUrl?: string;
  photoUrl?: string;
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PackageDetail {
  id: string;
  trackingCode: string;
  recipientName: string;
  recipientAddress: string;
  recipientPhone: string;
  recipientEmail?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressFloor?: string | null;
  addressCity?: string | null;
  addressZip?: string | null;
  addressReferences?: string | null;
  senderName?: string | null;
  senderAddress?: string | null;
  senderPhone?: string | null;
  status: PackageStatus;
  zoneId: string | null;
  zone?: PackageZoneDetail | null;
  driverId?: string | null;
  driver?: PackageDriverSummary | null;
  lat?: number | null;
  lng?: number | null;
  weight?: number | null;
  volume?: number | null;
  estimatedDeliveryAt?: string | null;
  deliveryWindowStart?: string | null;
  deliveryWindowEnd?: string | null;
  signatureUrl: string | null;
  photoUrl: string | null;
  isArchived: boolean;
  history: PackageHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface PackageFilterParams {
  search?: string;
  trackingCode?: string;
  status?: string;
  zoneId?: string;
  driverId?: string;
  dateFrom?: string;
  dateTo?: string;
  isArchived?: boolean;
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
  addressCountry?: string;
  zoneId: string;
  lat?: number | null;
  lng?: number | null;
  weight?: number | null;
  volume?: number | null;
  deliveryWindowStart?: string | null;
  deliveryWindowEnd?: string | null;
}

export interface UpdatePackageInput {
  recipientName?: string;
  recipientAddress?: string;
  recipientPhone?: string;
  recipientEmail?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressFloor?: string | null;
  addressCity?: string | null;
  addressZip?: string | null;
  addressReferences?: string | null;
  senderName?: string | null;
  senderAddress?: string | null;
  senderPhone?: string | null;
  weight?: number | null;
  volume?: number | null;
  zoneId?: string | null;
  lat?: number | null;
  lng?: number | null;
  estimatedDeliveryAt?: string | null;
  deliveryWindowStart?: string | null;
  deliveryWindowEnd?: string | null;
}

export interface BulkPackageRow {
  trackingCode: string;
  recipientName: string;
  recipientAddress: string;
  recipientPhone: string;
  recipientEmail?: string | null;
  addressReferences?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressFloor?: string | null;
  addressCity?: string | null;
  addressZip?: string | null;
  addressCountry?: string | null;
  senderName?: string | null;
  senderAddress?: string | null;
  senderPhone?: string | null;
  weight?: number | null;
  volume?: number | null;
  zoneId?: string | null;
  lat?: number | null;
  lng?: number | null;
  estimatedDeliveryAt?: string | null;
  deliveryWindowStart?: string | null;
  deliveryWindowEnd?: string | null;
}

export interface BulkImportResult {
  count: number;
  assignedCount: number;
  pendingCount: number;
  items: Package[];
}

export interface DashboardStats {
  deliveredToday: number;
  inTransit: number;
  avgDeliveryTimeMinutes: number;
  zoneDistribution: { name: string; value: number }[];
  weeklyActivity: { date: string; delivered: number; failed: number }[];
  topDrivers: { driverId?: string; name: string; delivered: number; efficiency: number }[];
}

export interface DashboardStatsParams {
  dateFrom?: string;
  dateTo?: string;
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

function buildFilterQueryParams(
  filters: PackageFilterParams & { page?: number; limit?: number }
): URLSearchParams {
  const query = new URLSearchParams();
  if (filters.status) query.append('status', filters.status);
  if (filters.zoneId) query.append('zoneId', filters.zoneId);
  if (filters.driverId) query.append('driverId', filters.driverId);
  if (filters.dateFrom) query.append('dateFrom', filters.dateFrom);
  if (filters.dateTo) query.append('dateTo', filters.dateTo);
  if (filters.trackingCode?.trim()) {
    query.append('trackingCode', filters.trackingCode.trim().slice(0, 100));
  }
  const normalizedSearch = filters.search?.trim();
  if (normalizedSearch) {
    query.append('search', normalizedSearch.slice(0, 200));
  }
  if (filters.isArchived !== undefined) {
    query.append('isArchived', filters.isArchived.toString());
  }
  if (filters.page !== undefined) {
    query.append('page', filters.page.toString());
  }
  if (filters.limit !== undefined) {
    query.append('limit', filters.limit.toString());
  }
  return query;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function normalizePackageDetail(raw: unknown): PackageDetail {
  const root = isRecord(raw) ? raw : {};
  const base = isRecord(root.package) ? root.package : root;
  const evidences = isRecord(root.evidences)
    ? root.evidences
    : isRecord(base.evidences)
      ? base.evidences
      : isRecord(root.deliveryEvidences)
        ? root.deliveryEvidences
        : isRecord(base.deliveryEvidences)
          ? base.deliveryEvidences
          : null;

  const rawHistory = Array.isArray(base.history)
    ? base.history
    : Array.isArray(root.history)
      ? root.history
      : Array.isArray(base.packageHistory)
        ? base.packageHistory
        : Array.isArray(root.packageHistory)
          ? root.packageHistory
          : [];

  const history: PackageHistoryEntry[] = rawHistory
    .filter(isRecord)
    .map((entry, idx) => ({
      id: typeof entry.id === 'string' ? entry.id : `history-${idx}`,
      packageId: typeof entry.packageId === 'string' ? entry.packageId : undefined,
      status: typeof entry.status === 'string' ? entry.status : 'pending',
      userId: typeof entry.userId === 'string' ? entry.userId : null,
      user: isRecord(entry.user)
        ? {
            id: typeof entry.user.id === 'string' ? entry.user.id : '',
            username: typeof entry.user.username === 'string' ? entry.user.username : 'Sistema',
            role: typeof entry.user.role === 'string' ? entry.user.role : undefined,
          }
        : null,
      notes: typeof entry.notes === 'string' ? entry.notes : null,
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
    }))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const rawZone = isRecord(base.zone) ? base.zone : isRecord(root.zone) ? root.zone : null;
  const zone: PackageZoneDetail | null = rawZone
    ? {
        id: typeof rawZone.id === 'string' ? rawZone.id : '',
        name: typeof rawZone.name === 'string' ? rawZone.name : 'Sin nombre',
        isActive: typeof rawZone.isActive === 'boolean' ? rawZone.isActive : undefined,
        driverId: typeof rawZone.driverId === 'string' ? rawZone.driverId : null,
        driver: isRecord(rawZone.driver)
          ? {
              id: typeof rawZone.driver.id === 'string' ? rawZone.driver.id : '',
              name: typeof rawZone.driver.name === 'string' ? rawZone.driver.name : '',
            }
          : null,
      }
    : null;

  const rawDriver = isRecord(base.driver)
    ? base.driver
    : isRecord(root.driver)
      ? root.driver
      : isRecord(base.assignedDriver)
        ? base.assignedDriver
        : isRecord(root.assignedDriver)
          ? root.assignedDriver
          : null;

  const driver: PackageDriverSummary | null = rawDriver
    ? {
        id: typeof rawDriver.id === 'string' ? rawDriver.id : '',
        name: typeof rawDriver.name === 'string' ? rawDriver.name : 'Conductor',
        lat: typeof rawDriver.lat === 'number' ? rawDriver.lat : null,
        lng: typeof rawDriver.lng === 'number' ? rawDriver.lng : null,
      }
    : zone?.driver ?? null;

  const rawSignature =
    readOptionalString(base.signatureUrl) ??
    readOptionalString(root.signatureUrl) ??
    readOptionalString(evidences?.signatureUrl) ??
    readOptionalString(evidences?.signature);

  const rawPhoto =
    readOptionalString(base.photoUrl) ??
    readOptionalString(root.photoUrl) ??
    readOptionalString(evidences?.photoUrl) ??
    readOptionalString(evidences?.photo);

  return {
    id: typeof base.id === 'string' ? base.id : '',
    trackingCode: typeof base.trackingCode === 'string' ? base.trackingCode : '',
    recipientName: typeof base.recipientName === 'string' ? base.recipientName : '',
    recipientAddress: typeof base.recipientAddress === 'string' ? base.recipientAddress : '',
    recipientPhone: typeof base.recipientPhone === 'string' ? base.recipientPhone : '',
    recipientEmail: typeof base.recipientEmail === 'string' ? base.recipientEmail : null,
    addressStreet: typeof base.addressStreet === 'string' ? base.addressStreet : null,
    addressNumber: typeof base.addressNumber === 'string' ? base.addressNumber : null,
    addressFloor: typeof base.addressFloor === 'string' ? base.addressFloor : null,
    addressCity: typeof base.addressCity === 'string' ? base.addressCity : null,
    addressZip: typeof base.addressZip === 'string' ? base.addressZip : null,
    addressReferences: typeof base.addressReferences === 'string' ? base.addressReferences : null,
    senderName: typeof base.senderName === 'string' ? base.senderName : null,
    senderAddress: typeof base.senderAddress === 'string' ? base.senderAddress : null,
    senderPhone: typeof base.senderPhone === 'string' ? base.senderPhone : null,
    status: (typeof base.status === 'string' ? base.status : 'pending') as PackageStatus,
    zoneId: typeof base.zoneId === 'string' ? base.zoneId : null,
    zone,
    driverId: typeof base.driverId === 'string' ? base.driverId : null,
    driver,
    lat: typeof base.lat === 'number' ? base.lat : null,
    lng: typeof base.lng === 'number' ? base.lng : null,
    weight: typeof base.weight === 'number' ? base.weight : null,
    volume: typeof base.volume === 'number' ? base.volume : null,
    estimatedDeliveryAt:
      typeof base.estimatedDeliveryAt === 'string' ? base.estimatedDeliveryAt : null,
    deliveryWindowStart:
      typeof base.deliveryWindowStart === 'string' ? base.deliveryWindowStart : null,
    deliveryWindowEnd:
      typeof base.deliveryWindowEnd === 'string' ? base.deliveryWindowEnd : null,
    signatureUrl: resolveApiAssetUrl(rawSignature),
    photoUrl: resolveApiAssetUrl(rawPhoto),
    isArchived: Boolean(base.isArchived),
    history,
    createdAt: typeof base.createdAt === 'string' ? base.createdAt : '',
    updatedAt: typeof base.updatedAt === 'string' ? base.updatedAt : '',
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
    signal?: AbortSignal,
    filters?: Omit<PackageFilterParams, 'status' | 'isArchived' | 'search'>
  ): Promise<PaginatedResponse<Package>> {
    const query = buildFilterQueryParams({
      ...filters,
      status,
      page,
      limit,
      isArchived,
      search,
    });

    return apiClient.get<PaginatedResponse<Package>>(`/api/packages?${query.toString()}`, {
      token,
      signal,
    });
  },

  async getPackageById(
    token: string,
    packageId: string,
    signal?: AbortSignal
  ): Promise<PackageDetail> {
    const raw = await apiClient.get<unknown>(`/api/packages/${encodeURIComponent(packageId)}`, {
      token,
      signal,
    });
    return normalizePackageDetail(raw);
  },

  async updatePackage(
    token: string,
    packageId: string,
    data: UpdatePackageInput
  ): Promise<PackageDetail> {
    const raw = await apiClient.patch<unknown>(
      `/api/packages/${encodeURIComponent(packageId)}`,
      data,
      { token }
    );
    return normalizePackageDetail(raw);
  },

  async exportPackagesCsv(
    token: string,
    filters: PackageFilterParams = {},
    signal?: AbortSignal
  ): Promise<BlobDownloadResult> {
    const query = buildFilterQueryParams(filters);
    const qs = query.toString();
    const endpoint = qs ? `/api/packages/export?${qs}` : '/api/packages/export';
    return apiClient.getBlob(endpoint, { token, signal });
  },

  async bulkCreatePackages(
    token: string,
    payload: { packages: BulkPackageRow[] } | { csv: string }
  ): Promise<BulkImportResult> {
    return apiClient.post<BulkImportResult>('/api/packages/bulk', payload, { token });
  },

  async getDashboardStats(
    token: string,
    params: DashboardStatsParams = {},
    signal?: AbortSignal
  ): Promise<DashboardStats> {
    const query = new URLSearchParams();
    if (params.dateFrom?.trim()) query.append('dateFrom', params.dateFrom.trim());
    if (params.dateTo?.trim()) query.append('dateTo', params.dateTo.trim());
    const qs = query.toString();
    const endpoint = qs ? `/api/packages/stats?${qs}` : '/api/packages/stats';
    return apiClient.get<DashboardStats>(endpoint, { token, signal });
  },

  async archivePackages(token: string, packageIds: string[]) {
    return apiClient.post('/api/packages/archive', { packageIds }, { token });
  },

  async unarchivePackages(token: string, packageIds: string[]): Promise<{ count: number }> {
    return apiClient.post<{ count: number }>('/api/packages/unarchive', { packageIds }, { token });
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
    photo?: string,
    options?: {
      notes?: string;
      reason?: string;
      estimatedDeliveryAt?: string;
    }
  ) {
    return apiClient.patch(
      `/api/packages/${encodeURIComponent(packageId)}/status`,
      {
        status,
        ...(lat !== undefined && { lat }),
        ...(lng !== undefined && { lng }),
        ...(signature && { signature }),
        ...(photo && { photo }),
        ...(options?.notes !== undefined && { notes: options.notes }),
        ...(options?.reason !== undefined && { reason: options.reason }),
        ...(options?.estimatedDeliveryAt !== undefined && {
          estimatedDeliveryAt: options.estimatedDeliveryAt,
        }),
      },
      { token }
    );
  },
};
