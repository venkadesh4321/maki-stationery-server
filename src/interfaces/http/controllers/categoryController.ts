import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { prisma } from '../../../infrastructure/db/prisma';
import { HttpError } from '../../../application/errors/httpError';

const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(100),
});

export const categoryController = {
  list: async (_req: Request, res: Response): Promise<void> => {
    const [categories, productCounts] = await Promise.all([
      prisma.category.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
        },
      }),
      prisma.product.groupBy({
        by: ['categoryId'],
        where: {
          deletedAt: null,
          category: {
            deletedAt: null,
          },
        },
        _count: { _all: true },
      }),
    ]);

    const countByCategoryId = new Map(productCounts.map((row) => [row.categoryId, row._count._all]));
    const data = categories.map((category) => ({
      ...category,
      productCount: countByCategoryId.get(category.id) ?? 0,
    }));

    res.status(StatusCodes.OK).json({ data });
  },

  create: async (req: Request, res: Response): Promise<void> => {
    const parsed = createCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid category payload');
    }

    const existing = await prisma.category.findUnique({
      where: { name: parsed.data.name },
      select: { id: true, deletedAt: true },
    });

    if (existing && !existing.deletedAt) {
      throw HttpError.badRequest('Category already exists');
    }

    const category = existing
      ? await prisma.category.update({
          where: { id: existing.id },
          data: { deletedAt: null },
          select: { id: true, name: true },
        })
      : await prisma.category.create({
          data: { name: parsed.data.name },
          select: { id: true, name: true },
        });

    res.status(StatusCodes.CREATED).json({ message: 'Category created', category });
  },
};
