import { Request, Response } from 'express';
import { z } from 'zod';
import { analyticsService } from '../../../application/services/analyticsService';
import { HttpError } from '../../../shared/errors/httpError';

const dateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const monthlySchema = z.object({
  year: z.coerce.number().int().min(2000).max(3000).optional(),
});

const limitDateRangeSchema = dateRangeSchema.extend({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const daysSchema = z.object({
  days: z.coerce.number().int().positive().max(3650).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

function parseDate(value?: string): Date | undefined {
  return value ? new Date(value) : undefined;
}

export const analyticsController = {
  dashboard: async (_req: Request, res: Response): Promise<void> => {
    const data = await analyticsService.getDashboardOverview();
    res.json({ data });
  },

  dailySales: async (req: Request, res: Response): Promise<void> => {
    const parsed = dateRangeSchema.safeParse(req.query);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid query params');
    }

    const data = await analyticsService.getDailySalesReport({
      from: parseDate(parsed.data.from),
      to: parseDate(parsed.data.to),
    });

    res.json({ data });
  },

  monthlySales: async (req: Request, res: Response): Promise<void> => {
    const parsed = monthlySchema.safeParse(req.query);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid query params');
    }

    const data = await analyticsService.getMonthlySalesReport({ year: parsed.data.year });
    res.json({ data });
  },

  productProfit: async (req: Request, res: Response): Promise<void> => {
    const parsed = limitDateRangeSchema.safeParse(req.query);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid query params');
    }

    const data = await analyticsService.getProductWiseProfitReport({
      from: parseDate(parsed.data.from),
      to: parseDate(parsed.data.to),
      limit: parsed.data.limit,
    });

    res.json({ data });
  },

  itemProfit: async (req: Request, res: Response): Promise<void> => {
    const parsed = limitDateRangeSchema.safeParse(req.query);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid query params');
    }

    const data = await analyticsService.getItemWiseProfitReport({
      from: parseDate(parsed.data.from),
      to: parseDate(parsed.data.to),
      limit: parsed.data.limit,
    });

    res.json({ data });
  },

  categoryProfit: async (req: Request, res: Response): Promise<void> => {
    const parsed = dateRangeSchema.safeParse(req.query);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid query params');
    }

    const data = await analyticsService.getCategoryWiseProfitReport({
      from: parseDate(parsed.data.from),
      to: parseDate(parsed.data.to),
    });

    res.json({ data });
  },

  deadStock: async (req: Request, res: Response): Promise<void> => {
    const parsed = daysSchema.safeParse(req.query);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid query params');
    }

    const data = await analyticsService.getDeadStockReport({
      days: parsed.data.days,
    });

    res.json({ data });
  },

  fastMoving: async (req: Request, res: Response): Promise<void> => {
    const parsed = daysSchema.safeParse(req.query);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid query params');
    }

    const data = await analyticsService.getFastMovingProductsReport({
      days: parsed.data.days,
      limit: parsed.data.limit,
    });

    res.json({ data });
  },
};
