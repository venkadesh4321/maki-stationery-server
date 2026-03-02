import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { PurchaseService } from '../../../application/services/purchaseService';
import { HttpError } from '../middlewares/httpError';

const createPurchaseSchema = z.object({
  supplierId: z.number().int().positive(),
  invoiceNo: z.string().trim().min(1).max(100).optional(),
  purchaseDate: z.string().datetime().optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().positive(),
        unitCost: z.number().positive(),
      }),
    )
    .min(1),
});

const listPurchasesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  supplierId: z.coerce.number().int().positive().optional(),
});

const purchaseService = new PurchaseService();

export const purchaseController = {
  list: async (req: Request, res: Response): Promise<void> => {
    const parsed = listPurchasesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid query params');
    }

    const { page, limit, supplierId } = parsed.data;
    const result = await purchaseService.listPurchases({ page, limit, supplierId });

    res.status(StatusCodes.OK).json({
      data: result.items,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  },

  create: async (req: Request, res: Response): Promise<void> => {
    const parsed = createPurchaseSchema.safeParse(req.body);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid purchase payload');
    }

    if (!req.authUser) {
      throw HttpError.unauthorized('Missing auth user');
    }

    const purchase = await purchaseService.createPurchase(parsed.data, req.authUser.userId);

    res.status(StatusCodes.CREATED).json({
      message: 'Purchase created successfully',
      purchase,
    });
  },
};
