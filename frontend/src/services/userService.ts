
const API_URL = import.meta.env.VITE_API_URL || '/api';

export const userService = {
  async createDispatcher(token: string, data: { username: string; password: string }) {
    const res = await fetch(`${API_URL}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...data, role: 'dispatcher' }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create dispatcher');
    }
    return res.json();
  },

  async changePassword(token: string, newPassword: string) {
    const res = await fetch(`${API_URL}/users/password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ newPassword }),
    });

    if (!res.ok) {
       const err = await res.json();
       throw new Error(err.error || 'Failed to update password');
    }
  }
};
