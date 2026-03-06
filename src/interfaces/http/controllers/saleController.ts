import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { SaleService } from '../../../application/services/saleService';
import { HttpError } from '../middlewares/httpError';

const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  subtotal: z.number().nonnegative(),
  discount: z.number().nonnegative(),
  totalAmount: z.number().nonnegative(),
  paymentMode: z.enum(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER']),
});

const saleService = new SaleService();

export const saleController = {
  checkout: async (req: Request, res: Response): Promise<void> => {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid checkout payload');
    }

    if (!req.authUser) {
      throw HttpError.unauthorized('Missing auth user');
    }

    const sale = await saleService.checkout(parsed.data, req.authUser.userId);

    res.status(StatusCodes.CREATED).json({
      message: 'Checkout completed successfully',
      sale,
    });
  },
};
