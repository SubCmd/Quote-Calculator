-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CARD', 'CONSULTATION');

-- AlterTable
ALTER TABLE "quote" ADD COLUMN "payment_method" "PaymentMethod";

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_METHOD_SELECTED';
