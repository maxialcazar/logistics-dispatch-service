
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
    const res = await fetch('/api/zones', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch zones');
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

  async getPackages(token: string, status?: string, page = 1): Promise<PaginatedResponse<Package>> {
    const query = new URLSearchParams();
    if (status) query.append('status', status);
    query.append('page', page.toString());
    
    const res = await fetch(`/api/packages?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch packages');
    return res.json();
  }
};
