import { Role } from '@prisma/client';

export interface UserAuthRecord {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
}

export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdById?: number;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserAuthRecord | null>;
  createUser(input: CreateUserInput): Promise<UserAuthRecord>;
  updateLastLogin(userId: number): Promise<void>;
}
