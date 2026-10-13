-- AlterEnum
-- 20261013_add_payment_method 는 CREATE TYPE "PaymentMethod" 에서 멈춘 뒤
-- migrate resolve --applied 로 적용 표시만 되어서 이 줄이 실행되지 않았다.
-- 마이그레이션 파일은 수정하지 않고 새 마이그레이션으로 보정한다. (.claude/rules/database.md)
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_METHOD_SELECTED';

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "imp_uid" TEXT NOT NULL,
    "merchant_uid" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "raw_response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_imp_uid_key" ON "payment"("imp_uid");

-- CreateIndex
CREATE INDEX "payment_quote_id_idx" ON "payment"("quote_id");

-- CreateIndex
CREATE INDEX "payment_created_at_idx" ON "payment"("created_at");
