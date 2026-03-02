import { Prisma } from '@prisma/client';
import {
  CreateProductInput,
  ProductFilters,
  ProductListItem,
  ProductListResult,
  ProductRepository,
  UpdateProductInput,
} from '../../domain/repositories/productRepository';
import { prisma } from '../db/prisma';

function mapProduct(row: {
  id: number;
  name: string;
  categoryId: number;
  buyingPrice: Prisma.Decimal;
  mrp: Prisma.Decimal;
  sellingPrice: Prisma.Decimal;
  profitMargin: Prisma.Decimal;
  stockQuantity: number;
  minimumStockLevel: number;
  barcode: string | null;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  category: { name: string };
}): ProductListItem {
  return {
    id: row.id,
    name: row.name,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    buyingPrice: row.buyingPrice.toString(),
    mrp: row.mrp.toString(),
    sellingPrice: row.sellingPrice.toString(),
    profitMargin: row.profitMargin.toString(),
    stockQuantity: row.stockQuantity,
    minimumStockLevel: row.minimumStockLevel,
    barcode: row.barcode,
    imageUrl: row.imageUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaProductRepository implements ProductRepository {
  async ensureCategoryExists(categoryId: number): Promise<boolean> {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: { id: true },
    });

    return Boolean(category);
  }

  async findById(id: number): Promise<ProductListItem | null> {
    const row = await prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { category: { select: { name: true } } },
    });

    return row ? mapProduct(row) : null;
  }

  async findByBarcode(barcode: string): Promise<ProductListItem | null> {
    const row = await prisma.product.findFirst({
      where: { barcode, deletedAt: null },
      include: { category: { select: { name: true } } },
    });

    return row ? mapProduct(row) : null;
  }

  async create(input: CreateProductInput): Promise<ProductListItem> {
    const row = await prisma.product.create({
      data: input,
      include: { category: { select: { name: true } } },
    });

    return mapProduct(row);
  }

  async update(id: number, input: UpdateProductInput): Promise<ProductListItem> {
    const row = await prisma.product.update({
      where: { id },
      data: input,
      include: { category: { select: { name: true } } },
    });

    return mapProduct(row);
  }

  async softDelete(id: number): Promise<void> {
    await prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true },
    });
  }

  async list(filters: ProductFilters): Promise<ProductListResult> {
    const { page, limit, search, lowStockOnly } = filters;

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (!lowStockOnly) {
      const [rows, total] = await Promise.all([
        prisma.product.findMany({
          where,
          include: { category: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.product.count({ where }),
      ]);

      return {
        items: rows.map(mapProduct),
        total,
      };
    }

    const lowStockWhere = Prisma.sql`
      p."deletedAt" IS NULL
      AND p."stockQuantity" <= p."minimumStockLevel"
      ${search ? Prisma.sql`AND (p."name" ILIKE ${`%${search}%`} OR p."barcode" ILIKE ${`%${search}%`})` : Prisma.empty}
    `;

    const rows = await prisma.$queryRaw<
      Array<{
        id: number;
        name: string;
        categoryId: number;
        buyingPrice: Prisma.Decimal;
        mrp: Prisma.Decimal;
        sellingPrice: Prisma.Decimal;
        profitMargin: Prisma.Decimal;
        stockQuantity: number;
        minimumStockLevel: number;
        barcode: string | null;
        imageUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
        categoryName: string;
      }>
    >(Prisma.sql`
      SELECT
        p.id,
        p."name",
        p."categoryId",
        p."buyingPrice",
        p.mrp,
        p."sellingPrice",
        p."profitMargin",
        p."stockQuantity",
        p."minimumStockLevel",
        p.barcode,
        p."imageUrl",
        p."createdAt",
        p."updatedAt",
        c.name AS "categoryName"
      FROM "Product" p
      INNER JOIN "Category" c ON c.id = p."categoryId"
      WHERE ${lowStockWhere}
      ORDER BY p."createdAt" DESC
      OFFSET ${(page - 1) * limit}
      LIMIT ${limit}
    `);

    const countRows = await prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM "Product" p
      WHERE ${lowStockWhere}
    `);

    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        buyingPrice: row.buyingPrice.toString(),
        mrp: row.mrp.toString(),
        sellingPrice: row.sellingPrice.toString(),
        profitMargin: row.profitMargin.toString(),
        stockQuantity: row.stockQuantity,
        minimumStockLevel: row.minimumStockLevel,
        barcode: row.barcode,
        imageUrl: row.imageUrl,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      total: Number(countRows[0]?.total ?? 0n),
    };
  }
}
