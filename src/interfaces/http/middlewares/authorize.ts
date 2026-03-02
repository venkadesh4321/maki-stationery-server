import { NextFunction, Request, Response } from 'express';
import { Role } from '../../../domain/entities/user';
import { HttpError } from './httpError';

export function authorize(allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      throw HttpError.unauthorized();
    }

    if (!allowedRoles.includes(req.authUser.role)) {
      throw HttpError.forbidden('Insufficient role');
    }

    next();
  };
}
