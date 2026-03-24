import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { CustomerService } from '../../../application/services/customerService';
import { HttpError } from '../../../shared/errors/httpError';

const createCustomerSchema = z.object({
  name: z.string().trim().min(2).max(150),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().email().max(120).optional(),
  address: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(300).optional(),
});

const paymentSchema = z.object({
  amount: z.number().positive(),
  paymentMode: z.enum(['CASH', 'CARD', 'UPI']),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(200).optional(),
});

function parseCustomerId(req: Request): number {
  const customerId = Number(req.params.id);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    throw HttpError.badRequest('Invalid customer id');
  }
  return customerId;
}

const customerService = new CustomerService();

export const customerController = {
  list: async (_req: Request, res: Response): Promise<void> => {
    const customers = await customerService.list();
    res.status(StatusCodes.OK).json({ data: customers });
  },

  create: async (req: Request, res: Response): Promise<void> => {
    const parsed = createCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid customer payload');
    }

    const customer = await customerService.create(parsed.data);
    res.status(StatusCodes.CREATED).json({ message: 'Customer created', customer });
  },

  ledger: async (req: Request, res: Response): Promise<void> => {
    const customerId = parseCustomerId(req);
    const data = await customerService.getLedger(customerId);
    res.status(StatusCodes.OK).json({ data });
  },

  recordPayment: async (req: Request, res: Response): Promise<void> => {
    if (!req.authUser) {
      throw HttpError.unauthorized('Missing auth user');
    }

    const customerId = parseCustomerId(req);
    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid payment payload');
    }

    const entry = await customerService.recordPayment(customerId, {
      ...parsed.data,
      createdById: req.authUser.userId,
    });

    res.status(StatusCodes.CREATED).json({ message: 'Payment recorded', entry });
  },
};
