import { Prisma } from '@prisma/client';
import {
  ProductFilters,
  ProductListItem,
  ProductListResult,
  ProductRepository,
} from '../../domain/repositories/productRepository';
import { HttpError } from '../../shared/errors/httpError';
import { toDecimal } from '../../shared/utils/decimal';

interface CreateProductPayload {
  name: string;
  categoryId: number;
  buyingPrice: number;
  mrp: number;
  sellingPrice: number;
  stockQuantity: number;
  minimumStockLevel: number;
  barcode?: string;
  imageUrl?: string;
}

interface UpdateProductPayload {
  name?: string;
  categoryId?: number;
  buyingPrice?: number;
  mrp?: number;
  sellingPrice?: number;
  stockQuantity?: number;
  minimumStockLevel?: number;
  barcode?: string;
  imageUrl?: string;
}

function validatePricing(buyingPrice: number, mrp: number, sellingPrice: number): void {
  if (buyingPrice < 0 || mrp < 0 || sellingPrice < 0) {
    throw HttpError.badRequest('Prices must be non-negative');
  }

  if (sellingPrice > mrp) {
    throw HttpError.badRequest('Selling price cannot be greater than MRP');
  }
}

function calculateProfitMargin(buyingPrice: number, sellingPrice: number): Prisma.Decimal {
  if (buyingPrice === 0) {
    return new Prisma.Decimal(0);
  }

  const marginPercent = ((sellingPrice - buyingPrice) / buyingPrice) * 100;
  return new Prisma.Decimal(marginPercent.toFixed(2));
}

function validateStock(stockQuantity: number, minimumStockLevel: number): void {
  if (stockQuantity < 0 || minimumStockLevel < 0) {
    throw HttpError.badRequest('Stock values must be non-negative');
  }
}

export class ProductService {
  constructor(private readonly productRepository: ProductRepository) {}

  async createProduct(payload: CreateProductPayload): Promise<ProductListItem> {
    validatePricing(payload.buyingPrice, payload.mrp, payload.sellingPrice);
    validateStock(payload.stockQuantity, payload.minimumStockLevel);

    const categoryExists = await this.productRepository.ensureCategoryExists(payload.categoryId);
    if (!categoryExists) {
      throw HttpError.badRequest('Invalid categoryId');
    }

    if (payload.barcode) {
      const existingBarcode = await this.productRepository.findByBarcode(payload.barcode);
      if (existingBarcode) {
        throw HttpError.badRequest('Barcode already exists');
      }
    }

    const profitMargin = calculateProfitMargin(payload.buyingPrice, payload.sellingPrice);

    return this.productRepository.create({
      name: payload.name,
      categoryId: payload.categoryId,
      buyingPrice: toDecimal(payload.buyingPrice),
      mrp: toDecimal(payload.mrp),
      sellingPrice: toDecimal(payload.sellingPrice),
      profitMargin,
      stockQuantity: payload.stockQuantity,
      minimumStockLevel: payload.minimumStockLevel,
      barcode: payload.barcode,
      imageUrl: payload.imageUrl,
    });
  }

  async updateProduct(id: number, payload: UpdateProductPayload): Promise<ProductListItem> {
    const existing = await this.productRepository.findById(id);
    if (!existing) {
      throw HttpError.notFound('Product not found');
    }

    const buyingPrice = payload.buyingPrice ?? Number(existing.buyingPrice);
    const mrp = payload.mrp ?? Number(existing.mrp);
    const sellingPrice = payload.sellingPrice ?? Number(existing.sellingPrice);

    validatePricing(buyingPrice, mrp, sellingPrice);
    validateStock(payload.stockQuantity ?? existing.stockQuantity, payload.minimumStockLevel ?? existing.minimumStockLevel);

    const nextCategoryId = payload.categoryId ?? existing.categoryId;
    if (payload.categoryId) {
      const categoryExists = await this.productRepository.ensureCategoryExists(nextCategoryId);
      if (!categoryExists) {
        throw HttpError.badRequest('Invalid categoryId');
      }
    }

    if (payload.barcode && payload.barcode !== existing.barcode) {
      const existingBarcode = await this.productRepository.findByBarcode(payload.barcode);
      if (existingBarcode) {
        throw HttpError.badRequest('Barcode already exists');
      }
    }

    return this.productRepository.update(id, {
      name: payload.name,
      categoryId: payload.categoryId,
      buyingPrice: payload.buyingPrice !== undefined ? toDecimal(payload.buyingPrice) : undefined,
      mrp: payload.mrp !== undefined ? toDecimal(payload.mrp) : undefined,
      sellingPrice: payload.sellingPrice !== undefined ? toDecimal(payload.sellingPrice) : undefined,
      profitMargin: calculateProfitMargin(buyingPrice, sellingPrice),
      stockQuantity: payload.stockQuantity,
      minimumStockLevel: payload.minimumStockLevel,
      barcode: payload.barcode,
      imageUrl: payload.imageUrl,
    });
  }

  async deleteProduct(id: number): Promise<void> {
    const existing = await this.productRepository.findById(id);
    if (!existing) {
      throw HttpError.notFound('Product not found');
    }

    await this.productRepository.softDelete(id);
  }

  async listProducts(filters: ProductFilters): Promise<ProductListResult> {
    return this.productRepository.list(filters);
  }
}
