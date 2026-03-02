import bcrypt from 'bcryptjs';
import { Prisma, PrismaClient, Role, StockMovementType } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminEmail = 'admin@stationery.local';
  const adminPassword = 'Admin@123';
  const staffEmail = 'staff@stationery.local';
  const staffPassword = 'Staff@123';

  const adminPasswordHash = await bcrypt.hash(adminPassword, 12);
  const staffPasswordHash = await bcrypt.hash(staffPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: 'System Admin',
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: staffEmail },
    update: {},
    create: {
      name: 'Store Staff',
      email: staffEmail,
      passwordHash: staffPasswordHash,
      role: Role.STAFF,
      isActive: true,
      createdById: admin.id,
    },
  });

  const categories = ['Pens', 'Notebooks', 'Art Supplies', 'Office Supplies'];
  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const [pens, notebooks, art, office] = await Promise.all([
    prisma.category.findUniqueOrThrow({ where: { name: 'Pens' } }),
    prisma.category.findUniqueOrThrow({ where: { name: 'Notebooks' } }),
    prisma.category.findUniqueOrThrow({ where: { name: 'Art Supplies' } }),
    prisma.category.findUniqueOrThrow({ where: { name: 'Office Supplies' } }),
  ]);

  const supplierA = await prisma.supplier.upsert({
    where: { email: 'supplier1@maki.local' },
    update: {},
    create: {
      name: 'Classic Stationery Distributors',
      email: 'supplier1@maki.local',
      phone: '9876543210',
      address: 'Chennai',
    },
  });

  const supplierB = await prisma.supplier.upsert({
    where: { email: 'supplier2@maki.local' },
    update: {},
    create: {
      name: 'Prime Paper Wholesale',
      email: 'supplier2@maki.local',
      phone: '9876501234',
      address: 'Coimbatore',
    },
  });

  const products = [
    {
      name: 'Blue Gel Pen',
      categoryId: pens.id,
      buyingPrice: 8,
      mrp: 15,
      sellingPrice: 12,
      profitMargin: 50,
      stockQuantity: 120,
      minimumStockLevel: 25,
      barcode: '890100100001',
    },
    {
      name: 'A4 Notebook 200pg',
      categoryId: notebooks.id,
      buyingPrice: 60,
      mrp: 110,
      sellingPrice: 85,
      profitMargin: 41.67,
      stockQuantity: 80,
      minimumStockLevel: 20,
      barcode: '890100100002',
    },
    {
      name: 'Sketch Marker Set',
      categoryId: art.id,
      buyingPrice: 110,
      mrp: 220,
      sellingPrice: 160,
      profitMargin: 45.45,
      stockQuantity: 35,
      minimumStockLevel: 10,
      barcode: '890100100003',
    },
    {
      name: 'Stapler Pins No.10',
      categoryId: office.id,
      buyingPrice: 14,
      mrp: 30,
      sellingPrice: 22,
      profitMargin: 57.14,
      stockQuantity: 150,
      minimumStockLevel: 30,
      barcode: '890100100004',
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { barcode: product.barcode },
      update: {},
      create: {
        ...product,
        buyingPrice: new Prisma.Decimal(product.buyingPrice),
        mrp: new Prisma.Decimal(product.mrp),
        sellingPrice: new Prisma.Decimal(product.sellingPrice),
        profitMargin: new Prisma.Decimal(product.profitMargin),
      },
    });
  }

  const purchaseCount = await prisma.purchase.count();
  if (purchaseCount === 0) {
    const [pen, notebook, marker] = await Promise.all([
      prisma.product.findUniqueOrThrow({ where: { barcode: '890100100001' } }),
      prisma.product.findUniqueOrThrow({ where: { barcode: '890100100002' } }),
      prisma.product.findUniqueOrThrow({ where: { barcode: '890100100003' } }),
    ]);

    await prisma.$transaction(async (tx) => {
      const purchaseDate = new Date();
      const purchase = await tx.purchase.create({
        data: {
          supplierId: supplierA.id,
          invoiceNo: 'INV-SEED-001',
          purchaseDate,
          totalCost: new Prisma.Decimal(0),
          createdById: admin.id,
        },
      });

      const seedItems = [
        { productId: pen.id, quantity: 40, unitCost: new Prisma.Decimal(8) },
        { productId: notebook.id, quantity: 20, unitCost: new Prisma.Decimal(60) },
        { productId: marker.id, quantity: 10, unitCost: new Prisma.Decimal(110) },
      ];

      let totalCost = new Prisma.Decimal(0);
      for (const item of seedItems) {
        const lineTotal = item.unitCost.mul(item.quantity).toDecimalPlaces(2);
        totalCost = totalCost.add(lineTotal).toDecimalPlaces(2);

        const updatedProduct = await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { increment: item.quantity } },
          select: { stockQuantity: true },
        });

        const purchaseItem = await tx.purchaseItem.create({
          data: {
            purchaseId: purchase.id,
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost,
            lineTotal,
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            purchaseId: purchase.id,
            purchaseItemId: purchaseItem.id,
            movementType: StockMovementType.PURCHASE_IN,
            quantity: item.quantity,
            balanceAfter: updatedProduct.stockQuantity,
            reference: purchase.invoiceNo ?? `PUR-${purchase.id}`,
          },
        });
      }

      await tx.purchase.update({
        where: { id: purchase.id },
        data: { totalCost },
      });
    });

    const staplerPins = await prisma.product.findUniqueOrThrow({ where: { barcode: '890100100004' } });
    await prisma.$transaction(async (tx) => {
      const purchaseDate = new Date(new Date().setDate(new Date().getDate() - 7));
      const unitCost = new Prisma.Decimal(14);
      const quantity = 60;
      const totalCost = unitCost.mul(quantity).toDecimalPlaces(2);

      const purchase = await tx.purchase.create({
        data: {
          supplierId: supplierB.id,
          invoiceNo: 'INV-SEED-002',
          purchaseDate,
          totalCost,
          createdById: admin.id,
        },
      });

      const updatedProduct = await tx.product.update({
        where: { id: staplerPins.id },
        data: { stockQuantity: { increment: quantity } },
        select: { stockQuantity: true },
      });

      const purchaseItem = await tx.purchaseItem.create({
        data: {
          purchaseId: purchase.id,
          productId: staplerPins.id,
          quantity,
          unitCost,
          lineTotal: totalCost,
        },
      });

      await tx.stockMovement.create({
        data: {
          productId: staplerPins.id,
          purchaseId: purchase.id,
          purchaseItemId: purchaseItem.id,
          movementType: StockMovementType.PURCHASE_IN,
          quantity,
          balanceAfter: updatedProduct.stockQuantity,
          reference: purchase.invoiceNo ?? `PUR-${purchase.id}`,
        },
      });
    });
  }

  console.log('Seeded users, catalog and sample purchases');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
