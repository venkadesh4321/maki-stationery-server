import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/db/prisma';

interface DateRangeInput {
  from?: Date;
  to?: Date;
}

function toSqlDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function resolveDateRange(input: DateRangeInput, fallbackDays: number): { from: Date; to: Date } {
  const to = input.to ?? new Date();
  const from =
    input.from ??
    new Date(to.getTime() - fallbackDays * 24 * 60 * 60 * 1000);

  return { from, to };
}

export const analyticsService = {
  async getDailySalesReport(input: DateRangeInput): Promise<
    Array<{ day: string; sales: number; cost: number; profit: number; items: number }>
  > {
    const { from, to } = resolveDateRange(input, 14);

    return prisma.$queryRaw<Array<{ day: string; sales: number; cost: number; profit: number; items: number }>>(Prisma.sql`
      SELECT
        DATE(p."purchaseDate")::text AS day,
        COALESCE(SUM((pi.quantity * pr."sellingPrice")::numeric), 0)::double precision AS sales,
        COALESCE(SUM(pi."lineTotal"), 0)::double precision AS cost,
        COALESCE(SUM((pi.quantity * pr."sellingPrice")::numeric - pi."lineTotal"), 0)::double precision AS profit,
        COALESCE(SUM(pi.quantity), 0)::int AS items
      FROM "Purchase" p
      INNER JOIN "PurchaseItem" pi ON pi."purchaseId" = p.id
      INNER JOIN "Product" pr ON pr.id = pi."productId"
      WHERE p."purchaseDate" >= ${new Date(`${toSqlDate(from)}T00:00:00.000Z`)}
        AND p."purchaseDate" < ${new Date(`${toSqlDate(to)}T23:59:59.999Z`)}
      GROUP BY DATE(p."purchaseDate")
      ORDER BY DATE(p."purchaseDate") ASC
    `);
  },

  async getMonthlySalesReport(input: { year?: number }): Promise<
    Array<{ month: string; sales: number; cost: number; profit: number }>
  > {
    const now = new Date();
    const year = input.year ?? now.getUTCFullYear();
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year + 1, 0, 1));

    return prisma.$queryRaw<Array<{ month: string; sales: number; cost: number; profit: number }>>(Prisma.sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', p."purchaseDate"), 'YYYY-MM') AS month,
        COALESCE(SUM((pi.quantity * pr."sellingPrice")::numeric), 0)::double precision AS sales,
        COALESCE(SUM(pi."lineTotal"), 0)::double precision AS cost,
        COALESCE(SUM((pi.quantity * pr."sellingPrice")::numeric - pi."lineTotal"), 0)::double precision AS profit
      FROM "Purchase" p
      INNER JOIN "PurchaseItem" pi ON pi."purchaseId" = p.id
      INNER JOIN "Product" pr ON pr.id = pi."productId"
      WHERE p."purchaseDate" >= ${from}
        AND p."purchaseDate" < ${to}
      GROUP BY DATE_TRUNC('month', p."purchaseDate")
      ORDER BY DATE_TRUNC('month', p."purchaseDate") ASC
    `);
  },

  async getProductWiseProfitReport(input: DateRangeInput & { limit?: number }): Promise<
    Array<{ productId: number; productName: string; quantity: number; sales: number; cost: number; profit: number }>
  > {
    const { from, to } = resolveDateRange(input, 30);
    const limit = input.limit ?? 20;

    return prisma.$queryRaw<
      Array<{ productId: number; productName: string; quantity: number; sales: number; cost: number; profit: number }>
    >(Prisma.sql`
      SELECT
        pr.id AS "productId",
        pr.name AS "productName",
        COALESCE(SUM(pi.quantity), 0)::int AS quantity,
        COALESCE(SUM((pi.quantity * pr."sellingPrice")::numeric), 0)::double precision AS sales,
        COALESCE(SUM(pi."lineTotal"), 0)::double precision AS cost,
        COALESCE(SUM((pi.quantity * pr."sellingPrice")::numeric - pi."lineTotal"), 0)::double precision AS profit
      FROM "Purchase" p
      INNER JOIN "PurchaseItem" pi ON pi."purchaseId" = p.id
      INNER JOIN "Product" pr ON pr.id = pi."productId"
      WHERE p."purchaseDate" >= ${new Date(`${toSqlDate(from)}T00:00:00.000Z`)}
        AND p."purchaseDate" < ${new Date(`${toSqlDate(to)}T23:59:59.999Z`)}
      GROUP BY pr.id, pr.name
      ORDER BY profit DESC
      LIMIT ${limit}
    `);
  },

  async getCategoryWiseProfitReport(input: DateRangeInput): Promise<
    Array<{ categoryId: number; categoryName: string; sales: number; cost: number; profit: number }>
  > {
    const { from, to } = resolveDateRange(input, 30);

    return prisma.$queryRaw<
      Array<{ categoryId: number; categoryName: string; sales: number; cost: number; profit: number }>
    >(Prisma.sql`
      SELECT
        c.id AS "categoryId",
        c.name AS "categoryName",
        COALESCE(SUM((pi.quantity * pr."sellingPrice")::numeric), 0)::double precision AS sales,
        COALESCE(SUM(pi."lineTotal"), 0)::double precision AS cost,
        COALESCE(SUM((pi.quantity * pr."sellingPrice")::numeric - pi."lineTotal"), 0)::double precision AS profit
      FROM "Purchase" p
      INNER JOIN "PurchaseItem" pi ON pi."purchaseId" = p.id
      INNER JOIN "Product" pr ON pr.id = pi."productId"
      INNER JOIN "Category" c ON c.id = pr."categoryId"
      WHERE p."purchaseDate" >= ${new Date(`${toSqlDate(from)}T00:00:00.000Z`)}
        AND p."purchaseDate" < ${new Date(`${toSqlDate(to)}T23:59:59.999Z`)}
      GROUP BY c.id, c.name
      ORDER BY profit DESC
    `);
  },

  async getDeadStockReport(input: { days?: number }): Promise<
    Array<{ productId: number; productName: string; stockQuantity: number; lastMovementAt: string | null }>
  > {
    const days = input.days ?? 60;
    const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return prisma.$queryRaw<
      Array<{ productId: number; productName: string; stockQuantity: number; lastMovementAt: string | null }>
    >(Prisma.sql`
      WITH last_moves AS (
        SELECT
          sm."productId",
          MAX(sm."createdAt") AS last_movement
        FROM "StockMovement" sm
        GROUP BY sm."productId"
      )
      SELECT
        p.id AS "productId",
        p.name AS "productName",
        p."stockQuantity" AS "stockQuantity",
        lm.last_movement::text AS "lastMovementAt"
      FROM "Product" p
      LEFT JOIN last_moves lm ON lm."productId" = p.id
      WHERE p."deletedAt" IS NULL
        AND p."stockQuantity" > 0
        AND (lm.last_movement IS NULL OR lm.last_movement < ${threshold})
      ORDER BY p."stockQuantity" DESC, p.name ASC
    `);
  },

  async getFastMovingProductsReport(input: { days?: number; limit?: number }): Promise<
    Array<{ productId: number; productName: string; movedQuantity: number; currentStock: number }>
  > {
    const days = input.days ?? 30;
    const limit = input.limit ?? 10;
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return prisma.$queryRaw<
      Array<{ productId: number; productName: string; movedQuantity: number; currentStock: number }>
    >(Prisma.sql`
      SELECT
        p.id AS "productId",
        p.name AS "productName",
        COALESCE(SUM(sm.quantity), 0)::int AS "movedQuantity",
        p."stockQuantity" AS "currentStock"
      FROM "Product" p
      INNER JOIN "StockMovement" sm ON sm."productId" = p.id
      WHERE p."deletedAt" IS NULL
        AND sm."createdAt" >= ${from}
        AND sm."movementType" = 'PURCHASE_IN'
      GROUP BY p.id, p.name, p."stockQuantity"
      ORDER BY "movedQuantity" DESC
      LIMIT ${limit}
    `);
  },
};
