export type UserRole = "dispatcher" | "driver";

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;

  driverId?: string;
}