import { CustomerLedgerEntryType, PaymentMode, Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/db/prisma';
import { HttpError } from '../../shared/errors/httpError';
import { toDecimal } from '../../shared/utils/decimal';

export class CustomerService {
  async list(): Promise<
    Array<{
      id: number;
      name: string;
      phone: string | null;
      email: string | null;
      address: string | null;
      notes: string | null;
      balance: string;
    }>
  > {
    const customers = await prisma.customer.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        address: true,
        notes: true,
        balance: true,
      },
    });

    return customers.map((customer) => ({
      ...customer,
      balance: customer.balance.toString(),
    }));
  }

  async create(input: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
  }): Promise<{
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    balance: string;
  }> {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      throw HttpError.badRequest('Customer name is required');
    }

    const customer = await prisma.customer.create({
      data: {
        name: trimmedName,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        notes: input.notes?.trim() || null,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        address: true,
        notes: true,
        balance: true,
      },
    });

    return {
      ...customer,
      balance: customer.balance.toString(),
    };
  }

  async getLedger(customerId: number): Promise<{
    customer: { id: number; name: string; balance: string };
    entries: Array<{
      id: number;
      type: CustomerLedgerEntryType;
      amount: string;
      saleId: number | null;
      paymentMode: PaymentMode | null;
      reference: string | null;
      note: string | null;
      createdAt: Date;
      createdBy: { id: number; name: string } | null;
    }>;
  }> {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { id: true, name: true, balance: true },
    });

    if (!customer) {
      throw HttpError.notFound('Customer not found');
    }

    const entries = await prisma.customerLedgerEntry.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        amount: true,
        saleId: true,
        paymentMode: true,
        reference: true,
        note: true,
        createdAt: true,
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      customer: { id: customer.id, name: customer.name, balance: customer.balance.toString() },
      entries: entries.map((entry) => ({
        ...entry,
        amount: entry.amount.toString(),
      })),
    };
  }

  async recordPayment(
    customerId: number,
    input: {
      amount: number;
      paymentMode: PaymentMode;
      reference?: string;
      note?: string;
      createdById: number;
    },
  ): Promise<{
    id: number;
    amount: string;
    paymentMode: PaymentMode | null;
    reference: string | null;
    note: string | null;
    createdAt: Date;
  }> {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw HttpError.badRequest('Payment amount must be greater than 0');
    }

    return prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: customerId, deletedAt: null },
        select: { id: true, balance: true },
      });

      if (!customer) {
        throw HttpError.notFound('Customer not found');
      }

      const amount = toDecimal(input.amount);

      const entry = await tx.customerLedgerEntry.create({
        data: {
          customerId,
          type: CustomerLedgerEntryType.PAYMENT,
          amount,
          paymentMode: input.paymentMode,
          reference: input.reference?.trim() || null,
          note: input.note?.trim() || null,
          createdById: input.createdById,
        },
        select: {
          id: true,
          amount: true,
          paymentMode: true,
          reference: true,
          note: true,
          createdAt: true,
        },
      });

      await tx.customer.update({
        where: { id: customerId },
        data: { balance: { decrement: amount } },
      });

      return {
        ...entry,
        amount: entry.amount.toString(),
      };
    });
  }

  static applyEntryBalanceDelta(entry: {
    type: CustomerLedgerEntryType;
    amount: Prisma.Decimal;
  }): Prisma.Decimal {
    if (entry.type === CustomerLedgerEntryType.PAYMENT || entry.type === CustomerLedgerEntryType.SALE_CANCEL) {
      return entry.amount.negated();
    }
    return entry.amount;
  }
}
