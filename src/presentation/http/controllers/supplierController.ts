import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { prisma } from '../../../infrastructure/db/prisma';
import { HttpError } from '../../../shared/errors/httpError';

const createSupplierSchema = z.object({
  name: z.string().trim().min(2).max(150),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(5).max(30).optional(),
  address: z.string().trim().min(3).max(300).optional(),
});

const updateSupplierSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(5).max(30).optional(),
  address: z.string().trim().min(3).max(300).optional(),
});

function parseSupplierId(req: Request): number {
  const supplierId = Number(req.params.id);
  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    throw HttpError.badRequest('Invalid supplier id');
  }
  return supplierId;
}

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
        address: true,
      },
    });

    res.status(StatusCodes.OK).json({ data: suppliers });
  },

  create: async (req: Request, res: Response): Promise<void> => {
    const parsed = createSupplierSchema.safeParse(req.body);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid supplier payload');
    }

    const email = parsed.data.email?.toLowerCase();

    if (email) {
      const existing = await prisma.supplier.findUnique({
        where: { email },
        select: { id: true, deletedAt: true },
      });

      if (existing && !existing.deletedAt) {
        throw HttpError.badRequest('Supplier email already exists');
      }

      if (existing?.deletedAt) {
        const supplier = await prisma.supplier.update({
          where: { id: existing.id },
          data: {
            name: parsed.data.name,
            email,
            phone: parsed.data.phone,
            address: parsed.data.address,
            deletedAt: null,
          },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
          },
        });

        res.status(StatusCodes.CREATED).json({ message: 'Supplier created', supplier });
        return;
      }
    }

    const supplier = await prisma.supplier.create({
      data: {
        name: parsed.data.name,
        email,
        phone: parsed.data.phone,
        address: parsed.data.address,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
      },
    });

    res.status(StatusCodes.CREATED).json({ message: 'Supplier created', supplier });
  },

  update: async (req: Request, res: Response): Promise<void> => {
    const supplierId = parseSupplierId(req);
    const parsed = updateSupplierSchema.safeParse(req.body);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid supplier payload');
    }

    if (Object.keys(parsed.data).length === 0) {
      throw HttpError.badRequest('No fields provided for update');
    }

    const existing = await prisma.supplier.findFirst({
      where: { id: supplierId, deletedAt: null },
      select: { id: true },
    });

    if (!existing) {
      throw HttpError.notFound('Supplier not found');
    }

    const email = parsed.data.email?.toLowerCase();
    if (email) {
      const duplicate = await prisma.supplier.findUnique({
        where: { email },
        select: { id: true },
      });

      if (duplicate && duplicate.id !== supplierId) {
        throw HttpError.badRequest('Supplier email already exists');
      }
    }

    const supplier = await prisma.supplier.update({
      where: { id: supplierId },
      data: {
        name: parsed.data.name,
        email,
        phone: parsed.data.phone,
        address: parsed.data.address,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
      },
    });

    res.status(StatusCodes.OK).json({ message: 'Supplier updated', supplier });
  },
};
