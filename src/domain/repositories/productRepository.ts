import { Prisma } from '@prisma/client';

export interface CreateProductInput {
  name: string;
  categoryId: number;
  buyingPrice: Prisma.Decimal;
  mrp: Prisma.Decimal;
  sellingPrice: Prisma.Decimal;
  profitMargin: Prisma.Decimal;
  stockQuantity: number;
  minimumStockLevel: number;
  barcode?: string;
  imageUrl?: string;
}

export interface UpdateProductInput {
  name?: string;
  categoryId?: number;
  buyingPrice?: Prisma.Decimal;
  mrp?: Prisma.Decimal;
  sellingPrice?: Prisma.Decimal;
  profitMargin?: Prisma.Decimal;
  stockQuantity?: number;
  minimumStockLevel?: number;
  barcode?: string;
  imageUrl?: string;
}

export interface ProductFilters {
  page: number;
  limit: number;
  search?: string;
  lowStockOnly?: boolean;
  categoryId?: number;
}

export interface ProductListItem {
  id: number;
  name: string;
  categoryId: number;
  categoryName: string;
  buyingPrice: string;
  mrp: string;
  sellingPrice: string;
  profitMargin: string;
  stockQuantity: number;
  minimumStockLevel: number;
  barcode: string | null;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductListResult {
  items: ProductListItem[];
  total: number;
}

export interface ProductRepository {
  ensureCategoryExists(categoryId: number): Promise<boolean>;
  findById(id: number): Promise<ProductListItem | null>;
  findByBarcode(barcode: string): Promise<ProductListItem | null>;
  create(input: CreateProductInput): Promise<ProductListItem>;
  update(id: number, input: UpdateProductInput): Promise<ProductListItem>;
  softDelete(id: number): Promise<void>;
  list(filters: ProductFilters): Promise<ProductListResult>;
}
