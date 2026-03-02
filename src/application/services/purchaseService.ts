import { Prisma, StockMovementType } from '@prisma/client';
import { prisma } from '../../infrastructure/db/prisma';
import { HttpError } from '../../interfaces/http/middlewares/httpError';

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

function toDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

function calculateProfitMargin(buyingPrice: Prisma.Decimal, sellingPrice: Prisma.Decimal): Prisma.Decimal {
  if (buyingPrice.eq(0)) {
    return new Prisma.Decimal(0);
  }

  return sellingPrice.sub(buyingPrice).div(buyingPrice).mul(100).toDecimalPlaces(2);
}

export class PurchaseService {
  async createPurchase(input: CreatePurchaseInput, createdById: number): Promise<{
    id: number;
    supplierId: number;
    invoiceNo: string | null;
    purchaseDate: Date;
    totalCost: string;
    items: Array<{
      id: number;
      productId: number;
      productName: string;
      quantity: number;
      unitCost: string;
      lineTotal: string;
    }>;
  }> {
    if (input.items.length === 0) {
      throw HttpError.badRequest('At least one purchase item is required');
    }

    const uniqueProducts = new Set(input.items.map((item) => item.productId));
    if (uniqueProducts.size !== input.items.length) {
      throw HttpError.badRequest('Duplicate productId in purchase items is not allowed');
    }

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

      return tx.purchase.update({
        where: { id: createdPurchase.id },
        data: { totalCost },
        select: {
          id: true,
          supplierId: true,
          invoiceNo: true,
          purchaseDate: true,
          totalCost: true,
          items: {
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
    });

    return {
      id: purchase.id,
      supplierId: purchase.supplierId,
      invoiceNo: purchase.invoiceNo,
      purchaseDate: purchase.purchaseDate,
      totalCost: purchase.totalCost.toString(),
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
}
