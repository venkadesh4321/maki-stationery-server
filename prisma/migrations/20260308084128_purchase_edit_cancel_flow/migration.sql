-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'PURCHASE_ADJUSTMENT_IN';
ALTER TYPE "StockMovementType" ADD VALUE 'PURCHASE_ADJUSTMENT_OUT';
ALTER TYPE "StockMovementType" ADD VALUE 'PURCHASE_CANCEL_OUT';

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" INTEGER,
ADD COLUMN     "status" "PurchaseStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");

-- CreateIndex
CREATE INDEX "Purchase_cancelledById_idx" ON "Purchase"("cancelledById");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
