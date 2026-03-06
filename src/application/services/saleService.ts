import { PaymentMode, Prisma, StockMovementType } from '@prisma/client';
import { prisma } from '../../infrastructure/db/prisma';
import { HttpError } from '../../interfaces/http/middlewares/httpError';

interface SaleItemInput {
  productId: number;
  quantity: number;
}

interface CheckoutInput {
  items: SaleItemInput[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  paymentMode: PaymentMode;
}

function toDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

function buildFinalInvoiceNo(saleId: number): string {
  return `SAL-${saleId.toString().padStart(6, '0')}`;
}

export class SaleService {
  async checkout(input: CheckoutInput, createdById: number): Promise<{
    id: number;
    invoiceNo: string;
    saleDate: Date;
    subtotal: string;
    discount: string;
    totalAmount: string;
    payment: {
      mode: PaymentMode;
      amount: string;
    };
    items: Array<{
      id: number;
      productId: number;
      productName: string;
      quantity: number;
      unitPrice: string;
      lineTotal: string;
    }>;
  }> {
    if (input.items.length === 0) {
      throw HttpError.badRequest('Cannot checkout with empty cart');
    }

    const uniqueProducts = new Set(input.items.map((item) => item.productId));
    if (uniqueProducts.size !== input.items.length) {
      throw HttpError.badRequest('Duplicate productId in checkout items is not allowed');
    }

    if (input.discount < 0) {
      throw HttpError.badRequest('Discount cannot be negative');
    }

    const sale = await prisma.$transaction(async (tx) => {
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

      let calculatedSubtotal = new Prisma.Decimal(0);
      const lineItems: Array<{
        productId: number;
        productName: string;
        quantity: number;
        unitPrice: Prisma.Decimal;
        lineTotal: Prisma.Decimal;
      }> = [];

      for (const item of input.items) {
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
          throw HttpError.badRequest('Item quantity must be a positive integer');
        }

        const product = productMap.get(item.productId);
        if (!product) {
          throw HttpError.badRequest(`Product not found: ${item.productId}`);
        }

        if (item.quantity > product.stockQuantity) {
          throw HttpError.badRequest(`Insufficient stock for ${product.name}`);
        }

        const lineTotal = product.sellingPrice.mul(item.quantity).toDecimalPlaces(2);
        calculatedSubtotal = calculatedSubtotal.add(lineTotal).toDecimalPlaces(2);

        lineItems.push({
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: product.sellingPrice,
          lineTotal,
        });
      }

      const expectedSubtotal = toDecimal(input.subtotal);
      if (!calculatedSubtotal.equals(expectedSubtotal)) {
        throw HttpError.badRequest('Subtotal mismatch');
      }

      const discount = toDecimal(input.discount);
      const netTotal = calculatedSubtotal.sub(discount).toDecimalPlaces(2);
      const calculatedTotal = netTotal.lessThan(0) ? new Prisma.Decimal(0) : netTotal;

      const expectedTotal = toDecimal(input.totalAmount);
      if (!calculatedTotal.equals(expectedTotal)) {
        throw HttpError.badRequest('Total mismatch');
      }

      const createdSale = await tx.sale.create({
        data: {
          invoiceNo: `TMP-${Date.now()}-${createdById}-${Math.floor(Math.random() * 100000)}`,
          subtotal: calculatedSubtotal,
          discount,
          totalAmount: calculatedTotal,
          createdById,
        },
      });

      const createdItems: Array<{
        id: number;
        productId: number;
        productName: string;
        quantity: number;
        unitPrice: Prisma.Decimal;
        lineTotal: Prisma.Decimal;
      }> = [];

      for (const lineItem of lineItems) {
        const createdItem = await tx.saleItem.create({
          data: {
            saleId: createdSale.id,
            productId: lineItem.productId,
            quantity: lineItem.quantity,
            unitPrice: lineItem.unitPrice,
            lineTotal: lineItem.lineTotal,
          },
          select: {
            id: true,
            productId: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
          },
        });

        createdItems.push({
          ...createdItem,
          productName: lineItem.productName,
        });
      }

      await tx.payment.create({
        data: {
          saleId: createdSale.id,
          mode: input.paymentMode,
          amount: calculatedTotal,
        },
      });

      for (const item of createdItems) {
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
          throw HttpError.badRequest(`Insufficient stock for ${item.productName}`);
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
            saleId: createdSale.id,
            saleItemId: item.id,
            movementType: StockMovementType.SALE_OUT,
            quantity: item.quantity,
            balanceAfter: updatedProduct.stockQuantity,
            reference: buildFinalInvoiceNo(createdSale.id),
          },
        });
      }

      const finalSale = await tx.sale.update({
        where: { id: createdSale.id },
        data: { invoiceNo: buildFinalInvoiceNo(createdSale.id) },
        select: {
          id: true,
          invoiceNo: true,
          saleDate: true,
          subtotal: true,
          discount: true,
          totalAmount: true,
          items: {
            select: {
              id: true,
              productId: true,
              quantity: true,
              unitPrice: true,
              lineTotal: true,
              product: {
                select: {
                  name: true,
                },
              },
            },
          },
          payments: {
            select: {
              mode: true,
              amount: true,
            },
            take: 1,
            orderBy: {
              paidAt: 'desc',
            },
          },
        },
      });

      const payment = finalSale.payments[0];
      if (!payment) {
        throw HttpError.internal('Payment record missing');
      }

      return {
        id: finalSale.id,
        invoiceNo: finalSale.invoiceNo,
        saleDate: finalSale.saleDate,
        subtotal: finalSale.subtotal.toString(),
        discount: finalSale.discount.toString(),
        totalAmount: finalSale.totalAmount.toString(),
        payment: {
          mode: payment.mode,
          amount: payment.amount.toString(),
        },
        items: finalSale.items.map((saleItem) => ({
          id: saleItem.id,
          productId: saleItem.productId,
          productName: saleItem.product.name,
          quantity: saleItem.quantity,
          unitPrice: saleItem.unitPrice.toString(),
          lineTotal: saleItem.lineTotal.toString(),
        })),
      };
    });

    return sale;
  }
}
