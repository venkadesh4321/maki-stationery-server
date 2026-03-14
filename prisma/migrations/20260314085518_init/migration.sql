-- CreateEnum
CREATE TYPE "SalePaymentStatus" AS ENUM ('PAID', 'PARTIAL', 'CREDIT');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "amountDue" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "amountPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentStatus" "SalePaymentStatus" NOT NULL DEFAULT 'PAID';

-- CreateIndex
CREATE INDEX "Sale_paymentStatus_idx" ON "Sale"("paymentStatus");
