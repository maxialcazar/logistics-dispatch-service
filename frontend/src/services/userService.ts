
import { apiClient } from './apiClient';

export interface CreateDispatcherInput {
  username: string;
  password: string;
}

export const userService = {
  async createDispatcher(token: string, data: CreateDispatcherInput) {
    return apiClient.post('/api/users', { ...data, role: 'dispatcher' }, { token });
  },

  async changePassword(token: string, newPassword: string): Promise<void> {
    await apiClient.put<void>('/api/users/password', { newPassword }, { token });
  },
};
