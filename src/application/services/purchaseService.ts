import { Prisma, PurchaseStatus, StockMovementType } from '@prisma/client';
import { prisma } from '../../infrastructure/db/prisma';
import { HttpError } from '../../shared/errors/httpError';
import { toDecimal } from '../../shared/utils/decimal';

interface PurchaseItemInput {
  productId: number;
  quantity: number;
  unitCost: number;
}

interface CreatePurchaseInput {
  supplierId: number;
  invoiceNo?: string;
  purchaseDate?: string;
  items: PurchaseItemInput[];
}

interface UpdatePurchaseInput {
  supplierId: number;
  invoiceNo?: string;
  purchaseDate?: string;
  items: PurchaseItemInput[];
}

function calculateProfitMargin(buyingPrice: Prisma.Decimal, sellingPrice: Prisma.Decimal): Prisma.Decimal {
  if (buyingPrice.eq(0)) {
    return new Prisma.Decimal(0);
  }

  return sellingPrice.sub(buyingPrice).div(buyingPrice).mul(100).toDecimalPlaces(2);
}

type PurchaseDetails = {
  id: number;
  supplierId: number;
  supplier: {
    id: number;
    name: string;
  };
  invoiceNo: string | null;
  purchaseDate: Date;
  totalCost: string;
  status: PurchaseStatus;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdBy: {
    id: number;
    name: string;
    email: string;
  };
  cancelledBy: {
    id: number;
    name: string;
    email: string;
  } | null;
  items: Array<{
    id: number;
    productId: number;
    productName: string;
    quantity: number;
    unitCost: string;
    lineTotal: string;
  }>;
};

function validateUniqueProducts(items: PurchaseItemInput[]): void {
  const uniqueProducts = new Set(items.map((item) => item.productId));
  if (uniqueProducts.size !== items.length) {
    throw HttpError.badRequest('Duplicate productId in purchase items is not allowed');
  }
}

export class PurchaseService {
  async createPurchase(input: CreatePurchaseInput, createdById: number): Promise<PurchaseDetails> {
    if (input.items.length === 0) {
      throw HttpError.badRequest('At least one purchase item is required');
    }

    validateUniqueProducts(input.items);

    const purchase = await prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findFirst({
        where: { id: input.supplierId, deletedAt: null },
        select: { id: true },
      });

      if (!supplier) {
        throw HttpError.badRequest('Invalid supplierId');
      }

      const productIds = input.items.map((item) => item.productId);
      const products = await tx.product.findMany({
        where: {
          id: { in: productIds },
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          stockQuantity: true,
          sellingPrice: true,
        },
      });

      if (products.length !== productIds.length) {
        throw HttpError.badRequest('One or more products are invalid');
      }

      const productMap = new Map(products.map((product) => [product.id, product]));

      const createdPurchase = await tx.purchase.create({
        data: {
          supplierId: input.supplierId,
          invoiceNo: input.invoiceNo,
          purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : undefined,
          totalCost: new Prisma.Decimal(0),
          createdById,
        },
      });

      let totalCost = new Prisma.Decimal(0);

      for (const item of input.items) {
        const product = productMap.get(item.productId);
        if (!product) {
          throw HttpError.badRequest(`Product not found: ${item.productId}`);
        }

        if (item.quantity <= 0 || !Number.isInteger(item.quantity)) {
          throw HttpError.badRequest('Item quantity must be a positive integer');
        }

        if (item.unitCost <= 0) {
          throw HttpError.badRequest('Item unitCost must be greater than 0');
        }

        const unitCost = toDecimal(item.unitCost);
        const lineTotal = unitCost.mul(item.quantity).toDecimalPlaces(2);
        totalCost = totalCost.add(lineTotal).toDecimalPlaces(2);

        const updatedProduct = await tx.product.update({
          where: { id: product.id },
          data: {
            stockQuantity: { increment: item.quantity },
            buyingPrice: unitCost,
            profitMargin: calculateProfitMargin(unitCost, product.sellingPrice),
          },
          select: {
            id: true,
            stockQuantity: true,
          },
        });

        const purchaseItem = await tx.purchaseItem.create({
          data: {
            purchaseId: createdPurchase.id,
            productId: product.id,
            quantity: item.quantity,
            unitCost,
            lineTotal,
          },
          select: {
            id: true,
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: product.id,
            purchaseId: createdPurchase.id,
            purchaseItemId: purchaseItem.id,
            movementType: StockMovementType.PURCHASE_IN,
            quantity: item.quantity,
            balanceAfter: updatedProduct.stockQuantity,
            reference: input.invoiceNo ?? `PUR-${createdPurchase.id}`,
          },
        });
      }

      await tx.purchase.update({
        where: { id: createdPurchase.id },
        data: { totalCost },
      });

      return createdPurchase.id;
    });

    return this.getPurchaseById(purchase);
  }

  async getPurchaseById(purchaseId: number): Promise<PurchaseDetails> {
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      select: {
        id: true,
        supplierId: true,
        invoiceNo: true,
        purchaseDate: true,
        totalCost: true,
        status: true,
        cancelledAt: true,
        cancelReason: true,
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        cancelledBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        items: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            productId: true,
            quantity: true,
            unitCost: true,
            lineTotal: true,
            product: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!purchase) {
      throw HttpError.notFound('Purchase not found');
    }

    return {
      id: purchase.id,
      supplierId: purchase.supplierId,
      supplier: purchase.supplier,
      invoiceNo: purchase.invoiceNo,
      purchaseDate: purchase.purchaseDate,
      totalCost: purchase.totalCost.toString(),
      status: purchase.status,
      cancelledAt: purchase.cancelledAt,
      cancelReason: purchase.cancelReason,
      createdBy: purchase.createdBy,
      cancelledBy: purchase.cancelledBy,
      items: purchase.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        quantity: item.quantity,
        unitCost: item.unitCost.toString(),
        lineTotal: item.lineTotal.toString(),
      })),
    };
  }

  async updatePurchase(purchaseId: number, input: UpdatePurchaseInput): Promise<PurchaseDetails> {
    if (input.items.length === 0) {
      throw HttpError.badRequest('At least one purchase item is required');
    }

    validateUniqueProducts(input.items);

    await prisma.$transaction(async (tx) => {
      const existingPurchase = await tx.purchase.findUnique({
        where: { id: purchaseId },
        select: {
          id: true,
          status: true,
          items: {
            select: {
              id: true,
              productId: true,
              quantity: true,
            },
          },
        },
      });

      if (!existingPurchase) {
        throw HttpError.notFound('Purchase not found');
      }

      if (existingPurchase.status === PurchaseStatus.CANCELLED) {
        throw HttpError.badRequest('Cancelled purchase cannot be edited');
      }

      const supplier = await tx.supplier.findFirst({
        where: { id: input.supplierId, deletedAt: null },
        select: { id: true },
      });

      if (!supplier) {
        throw HttpError.badRequest('Invalid supplierId');
      }

      const newProductIds = input.items.map((item) => item.productId);
      const oldProductIds = existingPurchase.items.map((item) => item.productId);
      const allProductIds = Array.from(new Set([...oldProductIds, ...newProductIds]));

      const products = await tx.product.findMany({
        where: {
          id: { in: allProductIds },
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          stockQuantity: true,
          sellingPrice: true,
        },
      });

      if (products.length !== allProductIds.length) {
        throw HttpError.badRequest('One or more products are invalid');
      }

      const productMap = new Map(products.map((product) => [product.id, product]));
      const oldQuantityMap = new Map(existingPurchase.items.map((item) => [item.productId, item.quantity]));
      const newQuantityMap = new Map(input.items.map((item) => [item.productId, item.quantity]));

      for (const item of input.items) {
        if (item.quantity <= 0 || !Number.isInteger(item.quantity)) {
          throw HttpError.badRequest('Item quantity must be a positive integer');
        }

        if (item.unitCost <= 0) {
          throw HttpError.badRequest('Item unitCost must be greater than 0');
        }
      }

      for (const productId of allProductIds) {
        const oldQty = oldQuantityMap.get(productId) ?? 0;
        const newQty = newQuantityMap.get(productId) ?? 0;
        const delta = newQty - oldQty;

        if (delta === 0) {
          continue;
        }

        const product = productMap.get(productId);
        if (!product) {
          throw HttpError.badRequest(`Product not found: ${productId}`);
        }

        if (delta > 0) {
          const updatedProduct = await tx.product.update({
            where: { id: productId },
            data: {
              stockQuantity: { increment: delta },
            },
            select: {
              stockQuantity: true,
            },
          });

          await tx.stockMovement.create({
            data: {
              productId,
              purchaseId,
              movementType: StockMovementType.PURCHASE_ADJUSTMENT_IN,
              quantity: delta,
              balanceAfter: updatedProduct.stockQuantity,
              reference: input.invoiceNo ?? `PUR-${purchaseId}-EDIT`,
            },
          });
        } else {
          const decrementBy = Math.abs(delta);
          const stockUpdate = await tx.product.updateMany({
            where: {
              id: productId,
              stockQuantity: { gte: decrementBy },
            },
            data: {
              stockQuantity: { decrement: decrementBy },
            },
          });

          if (stockUpdate.count !== 1) {
            throw HttpError.badRequest(`Insufficient stock to reduce for ${product.name}`);
          }

          const updatedProduct = await tx.product.findUnique({
            where: { id: productId },
            select: { stockQuantity: true },
          });

          if (!updatedProduct) {
            throw HttpError.badRequest(`Product not found: ${productId}`);
          }

          await tx.stockMovement.create({
            data: {
              productId,
              purchaseId,
              movementType: StockMovementType.PURCHASE_ADJUSTMENT_OUT,
              quantity: decrementBy,
              balanceAfter: updatedProduct.stockQuantity,
              reference: input.invoiceNo ?? `PUR-${purchaseId}-EDIT`,
            },
          });
        }
      }

      await tx.purchaseItem.deleteMany({
        where: { purchaseId },
      });

      let totalCost = new Prisma.Decimal(0);

      for (const item of input.items) {
        const product = productMap.get(item.productId);
        if (!product) {
          throw HttpError.badRequest(`Product not found: ${item.productId}`);
        }

        const unitCost = toDecimal(item.unitCost);
        const lineTotal = unitCost.mul(item.quantity).toDecimalPlaces(2);
        totalCost = totalCost.add(lineTotal).toDecimalPlaces(2);

        await tx.purchaseItem.create({
          data: {
            purchaseId,
            productId: product.id,
            quantity: item.quantity,
            unitCost,
            lineTotal,
          },
        });

        await tx.product.update({
          where: { id: product.id },
          data: {
            buyingPrice: unitCost,
            profitMargin: calculateProfitMargin(unitCost, product.sellingPrice),
          },
        });
      }

      await tx.purchase.update({
        where: { id: purchaseId },
        data: {
          supplierId: input.supplierId,
          invoiceNo: input.invoiceNo,
          purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : undefined,
          totalCost,
        },
      });
    });

    return this.getPurchaseById(purchaseId);
  }

  async cancelPurchase(purchaseId: number, input: { reason?: string }, cancelledById: number): Promise<PurchaseDetails> {
    await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id: purchaseId },
        select: {
          id: true,
          status: true,
          invoiceNo: true,
          items: {
            select: {
              id: true,
              productId: true,
              quantity: true,
              product: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!purchase) {
        throw HttpError.notFound('Purchase not found');
      }

      if (purchase.status === PurchaseStatus.CANCELLED) {
        throw HttpError.badRequest('Purchase is already cancelled');
      }

      for (const item of purchase.items) {
        const stockUpdate = await tx.product.updateMany({
          where: {
            id: item.productId,
            stockQuantity: { gte: item.quantity },
          },
          data: {
            stockQuantity: { decrement: item.quantity },
          },
        });

        if (stockUpdate.count !== 1) {
          throw HttpError.badRequest(`Insufficient stock to cancel purchase for ${item.product.name}`);
        }

        const updatedProduct = await tx.product.findUnique({
          where: { id: item.productId },
          select: { stockQuantity: true },
        });

        if (!updatedProduct) {
          throw HttpError.badRequest(`Product not found: ${item.productId}`);
        }

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            purchaseId: purchase.id,
            purchaseItemId: item.id,
            movementType: StockMovementType.PURCHASE_CANCEL_OUT,
            quantity: item.quantity,
            balanceAfter: updatedProduct.stockQuantity,
            reference: purchase.invoiceNo ?? `PUR-${purchase.id}-CANCEL`,
          },
        });
      }

      await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          status: PurchaseStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: input.reason?.trim() || null,
          cancelledById,
        },
      });
    });

    return this.getPurchaseById(purchaseId);
  }

  async listPurchases(input: {
    page: number;
    limit: number;
    supplierId?: number;
    status?: PurchaseStatus;
    invoiceNo?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<{
    total: number;
    items: Array<{
      id: number;
      invoiceNo: string | null;
      purchaseDate: Date;
      totalCost: string;
      status: PurchaseStatus;
      supplier: {
        id: number;
        name: string;
      };
      createdBy: {
        id: number;
        name: string;
        email: string;
      };
      itemsCount: number;
    }>;
  }> {
    const where: Prisma.PurchaseWhereInput = {
      ...(input.supplierId ? { supplierId: input.supplierId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.invoiceNo
        ? {
            invoiceNo: {
              contains: input.invoiceNo.trim(),
              mode: 'insensitive',
            },
          }
        : {}),
      ...((input.fromDate || input.toDate)
        ? {
            purchaseDate: {
              ...(input.fromDate ? { gte: new Date(`${input.fromDate}T00:00:00.000Z`) } : {}),
              ...(input.toDate ? { lte: new Date(`${input.toDate}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await prisma.$transaction([
      prisma.purchase.count({ where }),
      prisma.purchase.findMany({
        where,
        orderBy: { purchaseDate: 'desc' },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        select: {
          id: true,
          invoiceNo: true,
          purchaseDate: true,
          totalCost: true,
          status: true,
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              items: true,
            },
          },
        },
      }),
    ]);

    return {
      total,
      items: rows.map((row) => ({
        id: row.id,
        invoiceNo: row.invoiceNo,
        purchaseDate: row.purchaseDate,
        totalCost: row.totalCost.toString(),
        status: row.status,
        supplier: row.supplier,
        createdBy: row.createdBy,
        itemsCount: row._count.items,
      })),
    };
  }
}
