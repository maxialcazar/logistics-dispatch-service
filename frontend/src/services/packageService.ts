
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
  createdAt: string;
  updatedAt: string;
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
    const res = await fetch('/api/zones?limit=100', { // Fetch all zones (up to limit)
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch zones');
    const data = await res.json();
    return data.items || [];
  },

  async createZone(token: string, name: string): Promise<Zone> {
    const res = await fetch('/api/zones', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error('Failed to create zone');
    return res.json();
  },

  async createPackage(token: string, data: any): Promise<Package> {
    const res = await fetch('/api/packages', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create package');
    }
    return res.json();
  },

  async getPackages(token: string, status?: string, page = 1, limit = 10, isArchived = false): Promise<PaginatedResponse<Package>> {
    const query = new URLSearchParams();
    if (status) query.append('status', status);
    query.append('page', page.toString());
    query.append('limit', limit.toString());
    query.append('isArchived', isArchived.toString());
    
    const res = await fetch(`/api/packages?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch packages');
    return res.json();
  },

  async getDashboardStats(token: string) {
    const res = await fetch('/api/packages/stats', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
  },

  async archivePackages(token: string, packageIds: string[]) {
      const res = await fetch('/api/packages/archive', {
          method: 'POST',
          headers: { 
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}` 
          },
          body: JSON.stringify({ packageIds })
      });
      if (!res.ok) throw new Error('Failed to archive packages');
      return res.json();
  },

  async deletePackages(token: string, packageIds: string[]) {
      const res = await fetch('/api/packages/delete', {
          method: 'POST',
          headers: { 
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}` 
          },
          body: JSON.stringify({ packageIds })
      });
      if (!res.ok) throw new Error('Failed to delete packages');
      return res.json();
  },

  // Driver Methods
  async getMyPackages(token: string): Promise<Package[]> {
      const res = await fetch('/api/packages/my-packages', {
          headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch my packages');
      return res.json();
  },

  async updateStatus(token: string, packageId: string, status: string, lat?: number, lng?: number) {
      const res = await fetch(`/api/packages/${packageId}/status`, {
          method: 'PATCH',
          headers: { 
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}` 
          },
          body: JSON.stringify({ status, lat, lng })
      });
      
      if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || err.error || 'Failed to update status');
      }
      return res.json();
  }
};
