import { NextFunction, Request, Response } from 'express';
import { authService } from '../../../application/services/authService';
import { HttpError } from '../../../application/errors/httpError';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw HttpError.unauthorized('Missing bearer token');
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = authService.verifyToken(token);
    req.authUser = { userId: payload.userId, role: payload.role };
    next();
  } catch {
    throw HttpError.unauthorized('Invalid or expired token');
  }
}
