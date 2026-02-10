export interface Driver {
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
  async getDrivers(token: string, page = 1, limit = 100): Promise<PaginatedResponse<Driver>> {
    const res = await fetch(`/api/drivers?page=${page}&limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch drivers');
    return res.json();
  },

  async createDriver(token: string, data: { name: string; username: string; password: string }): Promise<Driver> {
    const res = await fetch('/api/drivers', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create driver');
    }
    return res.json();
  },

  async assignZones(token: string, driverId: string, zoneIds: string[]) {
    const res = await fetch(`/api/drivers/${driverId}/zones`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify({ zoneIds })
    });
    if (!res.ok) throw new Error('Failed to assign zones');
    return res.json();
  }
};
