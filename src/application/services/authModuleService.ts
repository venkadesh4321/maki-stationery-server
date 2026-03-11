import { Role } from '@prisma/client';
import { authService } from './authService';
import { UserRepository } from '../../domain/repositories/userRepository';
import { HttpError } from '../errors/httpError';

interface AuthResult {
  accessToken: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: Role;
  };
}

export async function loginUser(
  email: string,
  password: string,
  userRepository: UserRepository,
): Promise<AuthResult> {
  const user = await userRepository.findByEmail(email);

  if (!user || !user.isActive) {
    throw HttpError.unauthorized('Invalid credentials');
  }

  const validPassword = await authService.verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    throw HttpError.unauthorized('Invalid credentials');
  }

  await userRepository.updateLastLogin(user.id);

  const accessToken = authService.signToken({ userId: user.id, role: user.role });

  return {
    accessToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}

export async function registerUser(
  input: {
    name: string;
    email: string;
    password: string;
    role?: Role;
  },
  createdById: number,
  userRepository: UserRepository,
): Promise<{ id: number; name: string; email: string; role: Role }> {
  const existingUser = await userRepository.findByEmail(input.email);
  if (existingUser) {
    throw HttpError.badRequest('Email already in use');
  }

  const passwordHash = await authService.hashPassword(input.password);

  const createdUser = await userRepository.createUser({
    name: input.name,
    email: input.email,
    passwordHash,
    role: input.role ?? 'STAFF',
    createdById,
  });

  return {
    id: createdUser.id,
    name: createdUser.name,
    email: createdUser.email,
    role: createdUser.role,
  };
}
