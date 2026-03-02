import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../../infrastructure/db/prisma';

export const supplierController = {
  list: async (_req: Request, res: Response): Promise<void> => {
    const suppliers = await prisma.supplier.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
      },
    });

    res.status(StatusCodes.OK).json({ data: suppliers });
  },
};
