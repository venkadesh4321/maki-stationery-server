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

const listSalesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  invoiceNo: z.string().trim().min(1).max(100).optional(),
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
  paymentMode: z.enum(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER']).optional(),
  createdById: z.coerce.number().int().positive().optional(),
  status: z.enum(['ACTIVE', 'CANCELLED']).optional(),
});

const saleIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const cancelSaleSchema = z.object({
  reason: z.string().trim().min(1).max(300).optional(),
});

const saleService = new SaleService();

export const saleController = {
  list: async (req: Request, res: Response): Promise<void> => {
    const parsed = listSalesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid query params');
    }

    const { page, limit, invoiceNo, fromDate, toDate, paymentMode, createdById, status } = parsed.data;
    const result = await saleService.listSales({
      page,
      limit,
      invoiceNo,
      fromDate,
      toDate,
      paymentMode,
      createdById,
      status,
    });

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

  getById: async (req: Request, res: Response): Promise<void> => {
    const parsed = saleIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid sale id');
    }

    const sale = await saleService.getSaleById(parsed.data.id);
    res.status(StatusCodes.OK).json({ data: sale });
  },

  cancel: async (req: Request, res: Response): Promise<void> => {
    const paramsParsed = saleIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      throw HttpError.badRequest('Invalid sale id');
    }

    const bodyParsed = cancelSaleSchema.safeParse(req.body ?? {});
    if (!bodyParsed.success) {
      throw HttpError.badRequest('Invalid cancel payload');
    }

    if (!req.authUser) {
      throw HttpError.unauthorized('Missing auth user');
    }

    const sale = await saleService.cancelSale(
      paramsParsed.data.id,
      { reason: bodyParsed.data.reason },
      req.authUser.userId,
    );

    res.status(StatusCodes.OK).json({
      message: 'Sale cancelled successfully',
      sale,
    });
  },

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
