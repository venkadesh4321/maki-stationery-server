import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/db/prisma';

interface DateRangeInput {
  from?: Date;
  to?: Date;
}

function profitPercentFrom(sales: number, profit: number): number {
  if (!Number.isFinite(sales) || sales <= 0) {
    return 0;
  }

  return Number(((profit / sales) * 100).toFixed(2));
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
  async getDashboardOverview(): Promise<{
    metrics: {
      todaySales: number;
      todayProfit: number;
      monthlySales: number;
      monthlyProfit: number;
      totalStockValue: number;
      lowStockAlerts: number;
    };
    weeklyTrend: Array<{ week: string; sales: number; profit: number }>;
    hourlyTrend: Array<{ hour: string; sales: number }>;
    lowStockItems: Array<{ id: number; name: string; stock: number; min: number; category: string }>;
    topSellingProducts: Array<{ id: number; name: string; sold: number; revenue: number }>;
  }> {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [todayAgg, monthAgg, stockAgg, lowStockCount, weeklyTrend, hourlyTrend, lowStockItems, topSellingProducts] =
      await Promise.all([
        prisma.$queryRaw<Array<{ sales: number; profit: number }>>(Prisma.sql`
          SELECT
            COALESCE(SUM(s."totalAmount"), 0)::double precision AS sales,
            COALESCE(SUM(s."totalAmount" - c.cost), 0)::double precision AS profit
          FROM "Sale" s
          INNER JOIN (
            SELECT
              si."saleId",
              COALESCE(SUM((si.quantity * p."buyingPrice")::numeric), 0) AS cost
            FROM "SaleItem" si
            INNER JOIN "Product" p ON p.id = si."productId"
            GROUP BY si."saleId"
          ) c ON c."saleId" = s.id
          WHERE s."status" = 'ACTIVE'
            AND s."saleDate" >= ${startOfToday}
            AND s."saleDate" <= ${endOfToday}
        `),
        prisma.$queryRaw<Array<{ sales: number; profit: number }>>(Prisma.sql`
          SELECT
            COALESCE(SUM(s."totalAmount"), 0)::double precision AS sales,
            COALESCE(SUM(s."totalAmount" - c.cost), 0)::double precision AS profit
          FROM "Sale" s
          INNER JOIN (
            SELECT
              si."saleId",
              COALESCE(SUM((si.quantity * p."buyingPrice")::numeric), 0) AS cost
            FROM "SaleItem" si
            INNER JOIN "Product" p ON p.id = si."productId"
            GROUP BY si."saleId"
          ) c ON c."saleId" = s.id
          WHERE s."status" = 'ACTIVE'
            AND s."saleDate" >= ${startOfMonth}
            AND s."saleDate" <= ${endOfMonth}
        `),
        prisma.$queryRaw<Array<{ value: number }>>(Prisma.sql`
          SELECT
            COALESCE(SUM((p."stockQuantity" * p."buyingPrice")::numeric), 0)::double precision AS value
          FROM "Product" p
          WHERE p."deletedAt" IS NULL
        `),
        prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
          SELECT COUNT(*)::int AS count
          FROM "Product" p
          WHERE p."deletedAt" IS NULL
            AND p."stockQuantity" <= p."minimumStockLevel"
        `),
        prisma.$queryRaw<Array<{ week: string; sales: number; profit: number }>>(Prisma.sql`
          SELECT
            ('W' || CEIL(EXTRACT(DAY FROM s."saleDate") / 7.0)::int)::text AS week,
            COALESCE(SUM(s."totalAmount"), 0)::double precision AS sales,
            COALESCE(SUM(s."totalAmount" - c.cost), 0)::double precision AS profit
          FROM "Sale" s
          INNER JOIN (
            SELECT
              si."saleId",
              COALESCE(SUM((si.quantity * p."buyingPrice")::numeric), 0) AS cost
            FROM "SaleItem" si
            INNER JOIN "Product" p ON p.id = si."productId"
            GROUP BY si."saleId"
          ) c ON c."saleId" = s.id
          WHERE s."status" = 'ACTIVE'
            AND s."saleDate" >= ${startOfMonth}
            AND s."saleDate" <= ${endOfMonth}
          GROUP BY CEIL(EXTRACT(DAY FROM s."saleDate") / 7.0)
          ORDER BY CEIL(EXTRACT(DAY FROM s."saleDate") / 7.0)
        `),
        prisma.$queryRaw<Array<{ hour: string; sales: number }>>(Prisma.sql`
          SELECT
            TO_CHAR(DATE_TRUNC('hour', s."saleDate"), 'HH24:00') AS hour,
            COALESCE(SUM(s."totalAmount"), 0)::double precision AS sales
          FROM "Sale" s
          WHERE s."status" = 'ACTIVE'
            AND s."saleDate" >= ${startOfToday}
            AND s."saleDate" <= ${endOfToday}
          GROUP BY DATE_TRUNC('hour', s."saleDate")
          ORDER BY DATE_TRUNC('hour', s."saleDate")
        `),
        prisma.$queryRaw<Array<{ id: number; name: string; stock: number; min: number; category: string }>>(Prisma.sql`
          SELECT
            p.id,
            p.name,
            p."stockQuantity" AS stock,
            p."minimumStockLevel" AS min,
            c.name AS category
          FROM "Product" p
          INNER JOIN "Category" c ON c.id = p."categoryId"
          WHERE p."deletedAt" IS NULL
            AND p."stockQuantity" <= p."minimumStockLevel"
          ORDER BY p."stockQuantity" ASC, p.name ASC
          LIMIT 5
        `),
        prisma.$queryRaw<Array<{ id: number; name: string; sold: number; revenue: number }>>(Prisma.sql`
          SELECT
            pr.id AS id,
            pr.name AS name,
            COALESCE(SUM(si.quantity), 0)::int AS sold,
            COALESCE(SUM(si."lineTotal"), 0)::double precision AS revenue
          FROM "Sale" s
          INNER JOIN "SaleItem" si ON si."saleId" = s.id
          INNER JOIN "Product" pr ON pr.id = si."productId"
          WHERE s."status" = 'ACTIVE'
            AND s."saleDate" >= ${startOfToday}
            AND s."saleDate" <= ${endOfToday}
          GROUP BY pr.id, pr.name
          ORDER BY sold DESC, revenue DESC
          LIMIT 5
        `),
      ]);

    return {
      metrics: {
        todaySales: todayAgg[0]?.sales ?? 0,
        todayProfit: todayAgg[0]?.profit ?? 0,
        monthlySales: monthAgg[0]?.sales ?? 0,
        monthlyProfit: monthAgg[0]?.profit ?? 0,
        totalStockValue: stockAgg[0]?.value ?? 0,
        lowStockAlerts: lowStockCount[0]?.count ?? 0,
      },
      weeklyTrend,
      hourlyTrend,
      lowStockItems,
      topSellingProducts,
    };
  },

  async getDailySalesReport(input: DateRangeInput): Promise<
    Array<{ day: string; sales: number; cost: number; profit: number; items: number }>
  > {
    const { from, to } = resolveDateRange(input, 14);

    return prisma.$queryRaw<Array<{ day: string; sales: number; cost: number; profit: number; items: number }>>(Prisma.sql`
      SELECT
        DATE(s."saleDate")::text AS day,
        COALESCE(SUM(si."lineTotal"), 0)::double precision AS sales,
        COALESCE(SUM((si.quantity * pr."buyingPrice")::numeric), 0)::double precision AS cost,
        COALESCE(SUM(si."lineTotal" - (si.quantity * pr."buyingPrice")::numeric), 0)::double precision AS profit,
        COALESCE(SUM(si.quantity), 0)::int AS items
      FROM "Sale" s
      INNER JOIN "SaleItem" si ON si."saleId" = s.id
      INNER JOIN "Product" pr ON pr.id = si."productId"
      WHERE s."status" = 'ACTIVE'
        AND s."saleDate" >= ${new Date(`${toSqlDate(from)}T00:00:00.000Z`)}
        AND s."saleDate" <= ${new Date(`${toSqlDate(to)}T23:59:59.999Z`)}
      GROUP BY DATE(s."saleDate")
      ORDER BY DATE(s."saleDate") ASC
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
        TO_CHAR(DATE_TRUNC('month', s."saleDate"), 'YYYY-MM') AS month,
        COALESCE(SUM(si."lineTotal"), 0)::double precision AS sales,
        COALESCE(SUM((si.quantity * pr."buyingPrice")::numeric), 0)::double precision AS cost,
        COALESCE(SUM(si."lineTotal" - (si.quantity * pr."buyingPrice")::numeric), 0)::double precision AS profit
      FROM "Sale" s
      INNER JOIN "SaleItem" si ON si."saleId" = s.id
      INNER JOIN "Product" pr ON pr.id = si."productId"
      WHERE s."status" = 'ACTIVE'
        AND s."saleDate" >= ${from}
        AND s."saleDate" < ${to}
      GROUP BY DATE_TRUNC('month', s."saleDate")
      ORDER BY DATE_TRUNC('month', s."saleDate") ASC
    `);
  },

  async getProductWiseProfitReport(input: DateRangeInput & { limit?: number }): Promise<
    Array<{
      productId: number;
      productName: string;
      quantity: number;
      sales: number;
      cost: number;
      profit: number;
      profitPercent: number;
    }>
  > {
    const { from, to } = resolveDateRange(input, 30);
    const limit = input.limit ?? 20;

    const rows = await prisma.$queryRaw<
      Array<{ productId: number; productName: string; quantity: number; sales: number; cost: number; profit: number }>
    >(Prisma.sql`
      SELECT
        pr.id AS "productId",
        pr.name AS "productName",
        COALESCE(SUM(si.quantity), 0)::int AS quantity,
        COALESCE(SUM(si."lineTotal"), 0)::double precision AS sales,
        COALESCE(SUM((si.quantity * pr."buyingPrice")::numeric), 0)::double precision AS cost,
        COALESCE(SUM(si."lineTotal" - (si.quantity * pr."buyingPrice")::numeric), 0)::double precision AS profit
      FROM "Sale" s
      INNER JOIN "SaleItem" si ON si."saleId" = s.id
      INNER JOIN "Product" pr ON pr.id = si."productId"
      WHERE s."status" = 'ACTIVE'
        AND s."saleDate" >= ${new Date(`${toSqlDate(from)}T00:00:00.000Z`)}
        AND s."saleDate" <= ${new Date(`${toSqlDate(to)}T23:59:59.999Z`)}
      GROUP BY pr.id, pr.name
      ORDER BY profit DESC
      LIMIT ${limit}
    `);

    return rows.map((row) => ({
      ...row,
      profitPercent: profitPercentFrom(row.sales, row.profit),
    }));
  },

  async getItemWiseProfitReport(input: DateRangeInput & { limit?: number }): Promise<
    Array<{
      itemId: number;
      itemName: string;
      quantity: number;
      averageSellingPrice: number;
      averageCostPrice: number;
      sales: number;
      cost: number;
      profit: number;
      profitPercent: number;
    }>
  > {
    const { from, to } = resolveDateRange(input, 30);
    const limit = input.limit ?? 20;

    const rows = await prisma.$queryRaw<
      Array<{
        itemId: number;
        itemName: string;
        quantity: number;
        averageSellingPrice: number;
        averageCostPrice: number;
        sales: number;
        cost: number;
        profit: number;
      }>
    >(Prisma.sql`
      SELECT
        pr.id AS "itemId",
        pr.name AS "itemName",
        COALESCE(SUM(si.quantity), 0)::int AS quantity,
        COALESCE(AVG(si."unitPrice"), 0)::double precision AS "averageSellingPrice",
        COALESCE(AVG(pr."buyingPrice"), 0)::double precision AS "averageCostPrice",
        COALESCE(SUM(si."lineTotal"), 0)::double precision AS sales,
        COALESCE(SUM((si.quantity * pr."buyingPrice")::numeric), 0)::double precision AS cost,
        COALESCE(SUM(si."lineTotal" - (si.quantity * pr."buyingPrice")::numeric), 0)::double precision AS profit
      FROM "Sale" s
      INNER JOIN "SaleItem" si ON si."saleId" = s.id
      INNER JOIN "Product" pr ON pr.id = si."productId"
      WHERE s."status" = 'ACTIVE'
        AND s."saleDate" >= ${new Date(`${toSqlDate(from)}T00:00:00.000Z`)}
        AND s."saleDate" <= ${new Date(`${toSqlDate(to)}T23:59:59.999Z`)}
      GROUP BY pr.id, pr.name
      ORDER BY quantity DESC, sales DESC
      LIMIT ${limit}
    `);

    return rows.map((row) => ({
      ...row,
      profitPercent: profitPercentFrom(row.sales, row.profit),
    }));
  },

  async getCategoryWiseProfitReport(input: DateRangeInput): Promise<
    Array<{
      categoryId: number;
      categoryName: string;
      sales: number;
      cost: number;
      profit: number;
      profitPercent: number;
    }>
  > {
    const { from, to } = resolveDateRange(input, 30);

    const rows = await prisma.$queryRaw<
      Array<{ categoryId: number; categoryName: string; sales: number; cost: number; profit: number }>
    >(Prisma.sql`
      SELECT
        c.id AS "categoryId",
        c.name AS "categoryName",
        COALESCE(SUM(si."lineTotal"), 0)::double precision AS sales,
        COALESCE(SUM((si.quantity * pr."buyingPrice")::numeric), 0)::double precision AS cost,
        COALESCE(SUM(si."lineTotal" - (si.quantity * pr."buyingPrice")::numeric), 0)::double precision AS profit
      FROM "Sale" s
      INNER JOIN "SaleItem" si ON si."saleId" = s.id
      INNER JOIN "Product" pr ON pr.id = si."productId"
      INNER JOIN "Category" c ON c.id = pr."categoryId"
      WHERE s."status" = 'ACTIVE'
        AND s."saleDate" >= ${new Date(`${toSqlDate(from)}T00:00:00.000Z`)}
        AND s."saleDate" <= ${new Date(`${toSqlDate(to)}T23:59:59.999Z`)}
      GROUP BY c.id, c.name
      ORDER BY profit DESC
    `);

    return rows.map((row) => ({
      ...row,
      profitPercent: profitPercentFrom(row.sales, row.profit),
    }));
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
        COALESCE(SUM(ABS(sm.quantity)), 0)::int AS "movedQuantity",
        p."stockQuantity" AS "currentStock"
      FROM "Product" p
      INNER JOIN "StockMovement" sm ON sm."productId" = p.id
      WHERE p."deletedAt" IS NULL
        AND sm."createdAt" >= ${from}
        AND sm."movementType" = 'SALE_OUT'
      GROUP BY p.id, p.name, p."stockQuantity"
      ORDER BY "movedQuantity" DESC
      LIMIT ${limit}
    `);
  },
};
