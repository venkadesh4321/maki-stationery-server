UPDATE "Payment"
SET "mode" = 'UPI'
WHERE "mode" = 'BANK_TRANSFER';

UPDATE "CustomerLedgerEntry"
SET "paymentMode" = 'UPI'
WHERE "paymentMode" = 'BANK_TRANSFER';

ALTER TYPE "PaymentMode" RENAME TO "PaymentMode_old";

CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'CARD', 'UPI');

ALTER TABLE "Payment"
ALTER COLUMN "mode" TYPE "PaymentMode"
USING ("mode"::text::"PaymentMode");

ALTER TABLE "CustomerLedgerEntry"
ALTER COLUMN "paymentMode" TYPE "PaymentMode"
USING ("paymentMode"::text::"PaymentMode");

DROP TYPE "PaymentMode_old";
