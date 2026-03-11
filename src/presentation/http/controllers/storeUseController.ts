import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { StoreUseService } from '../../../application/services/storeUseService';
import { HttpError } from '../../../shared/errors/httpError';

const createStoreUseSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  note: z.string().trim().min(1).max(300).optional(),
  date: z.string().date().optional(),
});

const listStoreUseSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  productId: z.coerce.number().int().positive().optional(),
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
});

const storeUseService = new StoreUseService();

export const storeUseController = {
  create: async (req: Request, res: Response): Promise<void> => {
    const parsed = createStoreUseSchema.safeParse(req.body);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid store use payload');
    }

    const transaction = await storeUseService.createStoreUse(parsed.data);

    res.status(StatusCodes.CREATED).json({
      message: 'Store use entry recorded successfully',
      transaction,
    });
  },

  list: async (req: Request, res: Response): Promise<void> => {
    const parsed = listStoreUseSchema.safeParse(req.query);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid query params');
    }

    const { page, limit, productId, fromDate, toDate } = parsed.data;
    const result = await storeUseService.listStoreUse({
      page,
      limit,
      productId,
      fromDate,
      toDate,
    });

    res.status(StatusCodes.OK).json({
      data: result.items,
      summary: {
        totalValue: result.totalValue,
      },
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  },
};
