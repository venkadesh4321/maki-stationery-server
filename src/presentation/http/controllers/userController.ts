import { Request, Response } from 'express';

export const userController = {
  me(req: Request, res: Response): void {
    res.json({
      message: 'Protected profile endpoint',
      authUser: req.authUser,
    });
  },

  adminOnly(_req: Request, res: Response): void {
    res.json({
      message: 'Only admins can access this route',
    });
  },
};
