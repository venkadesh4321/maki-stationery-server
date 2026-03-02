import { Prisma } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { HttpError } from './httpError';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    res.status(StatusCodes.BAD_REQUEST).json({
      message: 'Database error',
      code: err.code,
    });
    return;
  }

  console.error(err);
  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
}
