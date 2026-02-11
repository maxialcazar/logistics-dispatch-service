
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
  async getZones(token: string, page = 1, limit = 100): Promise<PaginatedResponse<Zone>> {
    const res = await fetch(`/api/zones?page=${page}&limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch zones');
    return res.json();
  },

  async updateZone(token: string, id: string, data: { isActive?: boolean; driverId?: string; description?: string }): Promise<Zone> {
    const res = await fetch(`/api/zones/${id}`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update zone');
    }
    return res.json();
  },

  async createZone(token: string, data: { name: string; coordinates: { lat: number; lng: number }[]; description?: string }): Promise<Zone> {
    const res = await fetch('/api/zones', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create zone');
    }
    return res.json();
  },

  async deleteZone(token: string, id: string) {
      const res = await fetch(`/api/zones/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to delete zone');
      return true;
  },

  async setAllZonesStatus(token: string, isActive: boolean) {
      const res = await fetch('/api/zones/bulk-status', {
          method: 'POST',
          headers: { 
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}` 
          },
          body: JSON.stringify({ isActive })
      });
      if (!res.ok) throw new Error('Failed to update all zones');
      return res.json();
  }
};
