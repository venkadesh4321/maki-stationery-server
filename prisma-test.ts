import { Prisma, Role, StockMovementType } from '@prisma/client';
const r: Role = 'ADMIN';
const s: StockMovementType = 'PURCHASE_IN';
const d = new Prisma.Decimal(1.2);
const q = Prisma.sql`select ${1}`;
console.log(r,s,d,q);
