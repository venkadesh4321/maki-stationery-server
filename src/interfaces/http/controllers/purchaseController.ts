import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { PurchaseService } from '../../../application/services/purchaseService';
import { HttpError } from '../../../application/errors/httpError';

const purchaseItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  unitCost: z.number().positive(),
});

const createPurchaseSchema = z.object({
  supplierId: z.number().int().positive(),
  invoiceNo: z.string().trim().min(1).max(100).optional(),
  purchaseDate: z.string().datetime().optional(),
  items: z.array(purchaseItemSchema).min(1),
});

const updatePurchaseSchema = z.object({
  supplierId: z.number().int().positive(),
  invoiceNo: z.string().trim().min(1).max(100).optional(),
  purchaseDate: z.string().datetime().optional(),
  items: z.array(purchaseItemSchema).min(1),
});

const cancelPurchaseSchema = z.object({
  reason: z.string().trim().min(1).max(300).optional(),
});

const listPurchasesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  supplierId: z.coerce.number().int().positive().optional(),
  status: z.enum(['ACTIVE', 'CANCELLED']).optional(),
  invoiceNo: z.string().trim().min(1).max(100).optional(),
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
});

const purchaseIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const purchaseService = new PurchaseService();

export const purchaseController = {
  list: async (req: Request, res: Response): Promise<void> => {
    const parsed = listPurchasesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid query params');
    }

    const { page, limit, supplierId, status, invoiceNo, fromDate, toDate } = parsed.data;
    const result = await purchaseService.listPurchases({
      page,
      limit,
      supplierId,
      status,
      invoiceNo,
      fromDate,
      toDate,
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

  getById: async (req: Request, res: Response): Promise<void> => {
    const parsed = purchaseIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid purchase id');
    }

    const purchase = await purchaseService.getPurchaseById(parsed.data.id);
    res.status(StatusCodes.OK).json({ data: purchase });
  },

  update: async (req: Request, res: Response): Promise<void> => {
    const paramsParsed = purchaseIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      throw HttpError.badRequest('Invalid purchase id');
    }

    const bodyParsed = updatePurchaseSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      throw HttpError.badRequest('Invalid purchase payload');
    }

    const purchase = await purchaseService.updatePurchase(paramsParsed.data.id, bodyParsed.data);
    res.status(StatusCodes.OK).json({
      message: 'Purchase updated successfully',
      purchase,
    });
  },

  cancel: async (req: Request, res: Response): Promise<void> => {
    const paramsParsed = purchaseIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      throw HttpError.badRequest('Invalid purchase id');
    }

    const bodyParsed = cancelPurchaseSchema.safeParse(req.body ?? {});
    if (!bodyParsed.success) {
      throw HttpError.badRequest('Invalid cancel payload');
    }

    if (!req.authUser) {
      throw HttpError.unauthorized('Missing auth user');
    }

    const purchase = await purchaseService.cancelPurchase(
      paramsParsed.data.id,
      { reason: bodyParsed.data.reason },
      req.authUser.userId,
    );

    res.status(StatusCodes.OK).json({
      message: 'Purchase cancelled successfully',
      purchase,
    });
  },
};
