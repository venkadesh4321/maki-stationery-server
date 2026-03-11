import { AuthUser } from '../../../domain/entities/user';

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export {};
