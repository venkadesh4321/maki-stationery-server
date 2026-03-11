import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { ProductService } from '../../../application/services/productService';
import { PrismaProductRepository } from '../../../infrastructure/repositories/prismaProductRepository';
import { HttpError } from '../../../shared/errors/httpError';

const createProductSchema = z.object({
  name: z.string().min(2).max(200),
  categoryId: z.number().int().positive(),
  buyingPrice: z.number().nonnegative(),
  mrp: z.number().nonnegative(),
  sellingPrice: z.number().nonnegative(),
  stockQuantity: z.number().int().nonnegative(),
  minimumStockLevel: z.number().int().nonnegative(),
  barcode: z.string().min(2).max(100).optional(),
  imageUrl: z.string().url().optional(),
});

const updateProductSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  categoryId: z.number().int().positive().optional(),
  buyingPrice: z.number().nonnegative().optional(),
  mrp: z.number().nonnegative().optional(),
  sellingPrice: z.number().nonnegative().optional(),
  stockQuantity: z.number().int().nonnegative().optional(),
  minimumStockLevel: z.number().int().nonnegative().optional(),
  barcode: z.string().min(2).max(100).optional(),
  imageUrl: z.string().url().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  lowStockOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

const productService = new ProductService(new PrismaProductRepository());

function parseProductId(req: Request): number {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    throw HttpError.badRequest('Invalid product id');
  }
  return productId;
}

export const productController = {
  create: async (req: Request, res: Response): Promise<void> => {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid product payload');
    }

    const product = await productService.createProduct(parsed.data);
    res.status(StatusCodes.CREATED).json({ message: 'Product created', product });
  },

  update: async (req: Request, res: Response): Promise<void> => {
    const productId = parseProductId(req);

    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid product payload');
    }

    if (Object.keys(parsed.data).length === 0) {
      throw HttpError.badRequest('No fields provided for update');
    }

    const product = await productService.updateProduct(productId, parsed.data);
    res.status(StatusCodes.OK).json({ message: 'Product updated', product });
  },

  remove: async (req: Request, res: Response): Promise<void> => {
    const productId = parseProductId(req);
    await productService.deleteProduct(productId);

    res.status(StatusCodes.OK).json({ message: 'Product deleted' });
  },

  list: async (req: Request, res: Response): Promise<void> => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw HttpError.badRequest('Invalid query params');
    }

    const { page, limit, search, categoryId, lowStockOnly } = parsed.data;
    const result = await productService.listProducts({ page, limit, search, categoryId, lowStockOnly });

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
};
