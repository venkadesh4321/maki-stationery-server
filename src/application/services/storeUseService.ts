import { Prisma, StockMovementType } from '@prisma/client';
import { prisma } from '../../infrastructure/db/prisma';
import { HttpError } from '../../interfaces/http/middlewares/httpError';

interface CreateStoreUseInput {
  productId: number;
  quantity: number;
  note?: string;
  date?: string;
}

interface ListStoreUseInput {
  page: number;
  limit: number;
  productId?: number;
  fromDate?: string;
  toDate?: string;
}

export class StoreUseService {
  async createStoreUse(input: CreateStoreUseInput): Promise<{
    id: number;
    productId: number;
    productName: string;
    quantity: number;
    type: 'INTERNAL_USE';
    note: string | null;
    unitPrice: string;
    date: Date;
    balanceAfter: number;
  }> {
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw HttpError.badRequest('Quantity must be a positive integer');
    }

    const created = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: input.productId, deletedAt: null },
        select: { id: true, name: true, stockQuantity: true, buyingPrice: true },
      });

      if (!product) {
        throw HttpError.badRequest('Invalid productId');
      }

      if (input.quantity > product.stockQuantity) {
        throw HttpError.badRequest(`Insufficient stock for ${product.name}`);
      }

      const updated = await tx.product.update({
        where: { id: product.id },
        data: { stockQuantity: { decrement: input.quantity } },
        select: { stockQuantity: true },
      });

      const movement = await tx.stockMovement.create({
        data: {
          productId: product.id,
          movementType: StockMovementType.INTERNAL_USE,
          quantity: -input.quantity,
          unitPrice: product.buyingPrice,
          balanceAfter: updated.stockQuantity,
          reference: 'STORE_USE',
          note: input.note,
          createdAt: input.date ? new Date(`${input.date}T00:00:00.000Z`) : undefined,
        },
        select: {
          id: true,
          quantity: true,
          note: true,
          unitPrice: true,
          createdAt: true,
          balanceAfter: true,
        },
      });

      return {
        id: movement.id,
        productId: product.id,
        productName: product.name,
        quantity: movement.quantity,
        type: 'INTERNAL_USE' as const,
        note: movement.note,
        unitPrice: movement.unitPrice?.toString() ?? '0.00',
        date: movement.createdAt,
        balanceAfter: movement.balanceAfter,
      };
    });

    return created;
  }

  async listStoreUse(input: ListStoreUseInput): Promise<{
    total: number;
    totalValue: number;
    items: Array<{
      id: number;
      productId: number;
      productName: string;
      quantity: number;
      type: 'INTERNAL_USE';
      note: string | null;
      unitPrice: string;
      date: Date;
      balanceAfter: number;
    }>;
  }> {
    const where: Prisma.StockMovementWhereInput = {
      movementType: StockMovementType.INTERNAL_USE,
      ...(input.productId ? { productId: input.productId } : {}),
      ...((input.fromDate || input.toDate)
        ? {
            createdAt: {
              ...(input.fromDate ? { gte: new Date(`${input.fromDate}T00:00:00.000Z`) } : {}),
              ...(input.toDate ? { lte: new Date(`${input.toDate}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await prisma.$transaction([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        select: {
          id: true,
          productId: true,
          quantity: true,
          note: true,
          unitPrice: true,
          createdAt: true,
          balanceAfter: true,
          product: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    const totalValueRows = await prisma.$queryRaw<{ total: Prisma.Decimal | number | string }[]>(
      Prisma.sql`
        SELECT COALESCE(SUM(ABS("quantity") * COALESCE("unitPrice", 0)), 0) AS total
        FROM "StockMovement"
        WHERE "movementType" = ${StockMovementType.INTERNAL_USE}::"StockMovementType"
        ${input.productId ? Prisma.sql`AND "productId" = ${input.productId}` : Prisma.empty}
        ${input.fromDate ? Prisma.sql`AND "createdAt" >= ${input.fromDate}::date` : Prisma.empty}
        ${input.toDate ? Prisma.sql`AND "createdAt" < (${input.toDate}::date + INTERVAL '1 day')` : Prisma.empty}
      `,
    );
    const totalValue = Number(totalValueRows[0]?.total ?? 0);

    return {
      total,
      totalValue,
      items: rows.map((row) => ({
        id: row.id,
        productId: row.productId,
        productName: row.product.name,
        quantity: row.quantity,
        type: 'INTERNAL_USE' as const,
        note: row.note,
        unitPrice: row.unitPrice?.toString() ?? '0.00',
        date: row.createdAt,
        balanceAfter: row.balanceAfter,
      })),
    };
  }
}
