import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../../infrastructure/config/env';

interface JwtPayload {
  userId: number;
  role: Role;
}

const jwtExpiresIn = env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'];

export const authService = {
  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 12);
  },

  async verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  },

  signToken(payload: JwtPayload): string {
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: jwtExpiresIn });
  },

  verifyToken(token: string): JwtPayload {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  },
};
