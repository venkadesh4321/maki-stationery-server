import { CreateUserInput, UserRepository, UserAuthRecord } from '../../domain/repositories/userRepository';
import { prisma } from '../db/prisma';

export class PrismaUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<UserAuthRecord | null> {
    return prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        role: true,
        isActive: true,
      },
    });
  }

  async createUser(input: CreateUserInput): Promise<UserAuthRecord> {
    return prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role,
        isActive: true,
        createdById: input.createdById,
      },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        role: true,
        isActive: true,
      },
    });
  }

  async updateLastLogin(userId: number): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
      select: { id: true },
    });
  }
}
