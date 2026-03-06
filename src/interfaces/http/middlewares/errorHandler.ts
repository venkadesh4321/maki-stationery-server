import { Prisma } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { HttpError } from './httpError';
import { logger } from '../../../infrastructure/logger/logger';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestMeta = {
    requestId: (req.headers['x-request-id'] as string) || 'n/a',
    method: req.method,
    url: req.originalUrl,
  };

  if (err instanceof HttpError) {
    logger.error('http_error', { ...requestMeta, statusCode: err.statusCode, message: err.message });
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    logger.error('prisma_error', {
      ...requestMeta,
      code: err.code,
      message: err.message,
    });
    res.status(StatusCodes.BAD_REQUEST).json({
      message: 'Database error',
      code: err.code,
    });
    return;
  }

  logger.error('unhandled_error', {
    ...requestMeta,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
}
