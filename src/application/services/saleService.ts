import { PaymentMode, Prisma, SalePaymentStatus, SaleStatus, StockMovementType } from '@prisma/client';
import { prisma } from '../../infrastructure/db/prisma';
import { HttpError } from '../../shared/errors/httpError';
import { toDecimal } from '../../shared/utils/decimal';

interface SaleItemInput {
  productId: number;
  quantity: number;
}

interface CheckoutInput {
  items: SaleItemInput[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  paymentType: 'FULL' | 'PARTIAL' | 'CREDIT';
  paymentMode?: PaymentMode;
  paidAmount?: number;
  paymentReference?: string;
}

function buildFinalInvoiceNo(saleId: number): string {
  return `SAL-${saleId.toString().padStart(6, '0')}`;
}

function resolvePaymentSummary(input: {
  totalAmount: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  amountDue: Prisma.Decimal;
  latestPayment?: { amount: Prisma.Decimal } | null;
}): { amountPaid: Prisma.Decimal; amountDue: Prisma.Decimal; paymentStatus: SalePaymentStatus } {
  const total = input.totalAmount;
  let amountPaid = input.amountPaid;
  let amountDue = input.amountDue;

  if (amountPaid.equals(0) && amountDue.equals(0) && !total.equals(0)) {
    if (input.latestPayment) {
      amountPaid = input.latestPayment.amount;
      amountDue = total.sub(amountPaid).toDecimalPlaces(2);
    } else {
      amountPaid = new Prisma.Decimal(0);
      amountDue = total;
    }
  }

  if (amountDue.lessThan(0)) {
    amountDue = new Prisma.Decimal(0);
  }

  if (total.equals(0) || amountDue.equals(0)) {
    return { amountPaid, amountDue: new Prisma.Decimal(0), paymentStatus: SalePaymentStatus.PAID };
  }

  if (amountPaid.equals(0)) {
    return { amountPaid, amountDue, paymentStatus: SalePaymentStatus.CREDIT };
  }

  return { amountPaid, amountDue, paymentStatus: SalePaymentStatus.PARTIAL };
}

export class SaleService {
  async checkout(input: CheckoutInput, createdById: number): Promise<{
    id: number;
    invoiceNo: string;
    saleDate: Date;
    subtotal: string;
    discount: string;
    totalAmount: string;
    amountPaid: string;
    amountDue: string;
    paymentStatus: SalePaymentStatus;
    payment: {
      mode: PaymentMode;
      amount: string;
    } | null;
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

      const totalAmount = calculatedTotal;
      let amountPaid = new Prisma.Decimal(0);
      let paymentMode: PaymentMode | null = null;
      let paymentReference: string | null = null;

      if (input.paymentType === 'FULL') {
        if (!input.paymentMode) {
          throw HttpError.badRequest('Payment mode is required for full payment');
        }
        paymentMode = input.paymentMode;
        paymentReference = input.paymentReference?.trim() || null;
        amountPaid = totalAmount;
      } else if (input.paymentType === 'PARTIAL') {
        if (!input.paymentMode) {
          throw HttpError.badRequest('Payment mode is required for partial payment');
        }
        const paidInput = toDecimal(input.paidAmount ?? 0);
        if (paidInput.lte(0)) {
          throw HttpError.badRequest('Paid amount must be greater than 0 for partial payment');
        }
        if (!totalAmount.equals(0) && paidInput.gte(totalAmount)) {
          throw HttpError.badRequest('Paid amount must be less than total amount for partial payment');
        }
        paymentMode = input.paymentMode;
        paymentReference = input.paymentReference?.trim() || null;
        amountPaid = paidInput;
      } else if (input.paymentType === 'CREDIT') {
        if (input.paymentMode) {
          throw HttpError.badRequest('Payment mode should not be provided for credit sales');
        }
        const paidInput = toDecimal(input.paidAmount ?? 0);
        if (!paidInput.equals(0)) {
          throw HttpError.badRequest('Paid amount must be 0 for credit sales');
        }
        amountPaid = new Prisma.Decimal(0);
      }

      const amountDue = totalAmount.sub(amountPaid).toDecimalPlaces(2);
      const paymentStatus = resolvePaymentSummary({
        totalAmount,
        amountPaid,
        amountDue,
      }).paymentStatus;

      const createdSale = await tx.sale.create({
        data: {
          invoiceNo: `TMP-${Date.now()}-${createdById}-${Math.floor(Math.random() * 100000)}`,
          subtotal: calculatedSubtotal,
          discount,
          totalAmount,
          amountPaid,
          amountDue,
          paymentStatus,
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

      if (amountPaid.gt(0)) {
        if (!paymentMode) {
          throw HttpError.badRequest('Payment mode is required when a payment is recorded');
        }
        await tx.payment.create({
          data: {
            saleId: createdSale.id,
            mode: paymentMode,
            amount: amountPaid,
            reference: paymentReference,
          },
        });
      }

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
          amountPaid: true,
          amountDue: true,
          paymentStatus: true,
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
      const summary = resolvePaymentSummary({
        totalAmount: finalSale.totalAmount,
        amountPaid: finalSale.amountPaid,
        amountDue: finalSale.amountDue,
        latestPayment: payment ? { amount: payment.amount } : null,
      });

      return {
        id: finalSale.id,
        invoiceNo: finalSale.invoiceNo,
        saleDate: finalSale.saleDate,
        subtotal: finalSale.subtotal.toString(),
        discount: finalSale.discount.toString(),
        totalAmount: finalSale.totalAmount.toString(),
        amountPaid: summary.amountPaid.toString(),
        amountDue: summary.amountDue.toString(),
        paymentStatus: summary.paymentStatus,
        payment: payment
          ? {
              mode: payment.mode,
              amount: payment.amount.toString(),
            }
          : null,
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

  async listSales(input: {
    page: number;
    limit: number;
    invoiceNo?: string;
    fromDate?: string;
    toDate?: string;
    paymentMode?: PaymentMode;
    createdById?: number;
    status?: SaleStatus;
  }): Promise<{
    total: number;
    items: Array<{
      id: number;
      invoiceNo: string;
      saleDate: Date;
      subtotal: string;
      discount: string;
      totalAmount: string;
      amountPaid: string;
      amountDue: string;
      paymentStatus: SalePaymentStatus;
      status: SaleStatus;
      cancelledAt: Date | null;
      cancelReason: string | null;
      itemsCount: number;
      payment: {
        mode: PaymentMode;
        amount: string;
      } | null;
      createdBy: {
        id: number;
        name: string;
        email: string;
      };
    }>;
  }> {
    const where: Prisma.SaleWhereInput = {
      ...(input.invoiceNo
        ? {
            invoiceNo: {
              contains: input.invoiceNo.trim(),
              mode: 'insensitive',
            },
          }
        : {}),
      ...(input.createdById ? { createdById: input.createdById } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.paymentMode
        ? {
            payments: {
              some: {
                mode: input.paymentMode,
              },
            },
          }
        : {}),
      ...((input.fromDate || input.toDate)
        ? {
            saleDate: {
              ...(input.fromDate ? { gte: new Date(`${input.fromDate}T00:00:00.000Z`) } : {}),
              ...(input.toDate ? { lte: new Date(`${input.toDate}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await prisma.$transaction([
      prisma.sale.count({ where }),
      prisma.sale.findMany({
        where,
        orderBy: { saleDate: 'desc' },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        select: {
          id: true,
          invoiceNo: true,
          saleDate: true,
          subtotal: true,
          discount: true,
          totalAmount: true,
          amountPaid: true,
          amountDue: true,
          paymentStatus: true,
          status: true,
          cancelledAt: true,
          cancelReason: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
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
      items: rows.map((row) => {
        const payment = row.payments[0];
        const summary = resolvePaymentSummary({
          totalAmount: row.totalAmount,
          amountPaid: row.amountPaid,
          amountDue: row.amountDue,
          latestPayment: payment ? { amount: payment.amount } : null,
        });

        return {
          id: row.id,
          invoiceNo: row.invoiceNo,
          saleDate: row.saleDate,
          subtotal: row.subtotal.toString(),
          discount: row.discount.toString(),
          totalAmount: row.totalAmount.toString(),
          amountPaid: summary.amountPaid.toString(),
          amountDue: summary.amountDue.toString(),
          paymentStatus: summary.paymentStatus,
          status: row.status,
          cancelledAt: row.cancelledAt,
          cancelReason: row.cancelReason,
          itemsCount: row._count.items,
          payment: payment
            ? {
                mode: payment.mode,
                amount: payment.amount.toString(),
              }
            : null,
          createdBy: row.createdBy,
        };
      }),
    };
  }

  async getSaleById(saleId: number): Promise<{
    id: number;
    invoiceNo: string;
    saleDate: Date;
    subtotal: string;
    discount: string;
    totalAmount: string;
    amountPaid: string;
    amountDue: string;
    paymentStatus: SalePaymentStatus;
    status: SaleStatus;
    cancelledAt: Date | null;
    cancelReason: string | null;
    createdBy: {
      id: number;
      name: string;
      email: string;
    };
    payment: {
      mode: PaymentMode;
      amount: string;
      paidAt: Date;
      reference: string | null;
    } | null;
    items: Array<{
      id: number;
      productId: number;
      productName: string;
      quantity: number;
      unitPrice: string;
      lineTotal: string;
    }>;
  }> {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        invoiceNo: true,
        saleDate: true,
        subtotal: true,
        discount: true,
        totalAmount: true,
        amountPaid: true,
        amountDue: true,
        paymentStatus: true,
        status: true,
        cancelledAt: true,
        cancelReason: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        payments: {
          select: {
            mode: true,
            amount: true,
            paidAt: true,
            reference: true,
          },
          take: 1,
          orderBy: {
            paidAt: 'desc',
          },
        },
        items: {
          orderBy: { id: 'asc' },
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
      },
    });

    if (!sale) {
      throw HttpError.notFound('Sale not found');
    }

    const payment = sale.payments[0];
    const summary = resolvePaymentSummary({
      totalAmount: sale.totalAmount,
      amountPaid: sale.amountPaid,
      amountDue: sale.amountDue,
      latestPayment: payment ? { amount: payment.amount } : null,
    });

    return {
      id: sale.id,
      invoiceNo: sale.invoiceNo,
      saleDate: sale.saleDate,
      subtotal: sale.subtotal.toString(),
      discount: sale.discount.toString(),
      totalAmount: sale.totalAmount.toString(),
      amountPaid: summary.amountPaid.toString(),
      amountDue: summary.amountDue.toString(),
      paymentStatus: summary.paymentStatus,
      status: sale.status,
      cancelledAt: sale.cancelledAt,
      cancelReason: sale.cancelReason,
      createdBy: sale.createdBy,
      payment: payment
        ? {
            mode: payment.mode,
            amount: payment.amount.toString(),
            paidAt: payment.paidAt,
            reference: payment.reference,
          }
        : null,
      items: sale.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        lineTotal: item.lineTotal.toString(),
      })),
    };
  }

  async cancelSale(saleId: number, input: { reason?: string }, cancelledById: number): Promise<{
    id: number;
    invoiceNo: string;
    status: SaleStatus;
    cancelledAt: Date | null;
    cancelReason: string | null;
  }> {
    return prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        select: {
          id: true,
          invoiceNo: true,
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

      if (!sale) {
        throw HttpError.notFound('Sale not found');
      }

      if (sale.status === SaleStatus.CANCELLED) {
        throw HttpError.badRequest('Sale is already cancelled');
      }

      for (const item of sale.items) {
        const updatedProduct = await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQuantity: { increment: item.quantity },
          },
          select: {
            stockQuantity: true,
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            saleId: sale.id,
            saleItemId: item.id,
            movementType: StockMovementType.SALE_CANCEL_IN,
            quantity: item.quantity,
            balanceAfter: updatedProduct.stockQuantity,
            reference: `${sale.invoiceNo}-CANCEL`,
          },
        });
      }

      return tx.sale.update({
        where: { id: sale.id },
        data: {
          status: SaleStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: input.reason?.trim() || null,
          cancelledById,
        },
        select: {
          id: true,
          invoiceNo: true,
          status: true,
          cancelledAt: true,
          cancelReason: true,
        },
      });
    });
  }
}
