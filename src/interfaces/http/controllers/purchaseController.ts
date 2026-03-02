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

const purchaseService = new PurchaseService();

export const purchaseController = {
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
