export type Role = 'ADMIN' | 'STAFF';

export interface AuthUser {
  userId: number;
  role: Role;
}
