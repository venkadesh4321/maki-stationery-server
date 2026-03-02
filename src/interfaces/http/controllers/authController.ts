import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { loginUser, registerUser } from '../../../application/services/authModuleService';
import { PrismaUserRepository } from '../../../infrastructure/repositories/prismaUserRepository';
import { HttpError } from '../middlewares/httpError';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.nativeEnum(Role).optional(),
});

const userRepository = new PrismaUserRepository();

export const authController = {
  login: async (req: Request, res: Response): Promise<void> => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid login payload');
    }

    const result = await loginUser(parsed.data.email, parsed.data.password, userRepository);
    res.status(StatusCodes.OK).json(result);
  },

  register: async (req: Request, res: Response): Promise<void> => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid register payload');
    }

    if (!req.authUser) {
      throw HttpError.unauthorized('Missing auth user');
    }

    const createdUser = await registerUser(parsed.data, req.authUser.userId, userRepository);
    res.status(StatusCodes.CREATED).json({
      message: 'User registered successfully',
      user: createdUser,
    });
  },
};
