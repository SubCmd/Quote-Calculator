-- CreateEnum
CREATE TYPE "OptionPriceType" AS ENUM ('FIXED', 'RATE');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('FIXED', 'RATE');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'REQUESTED', 'CONFIRMED', 'EXPIRED', 'CANCELED');

-- CreateTable
CREATE TABLE "product" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "min_qty" INTEGER NOT NULL,
    "max_qty" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_tier" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "min_qty" INTEGER NOT NULL,
    "max_qty" INTEGER,
    "unit_price" INTEGER NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "price_tier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_group" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "single_select" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "option_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_option" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_type" "OptionPriceType" NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "rate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "product_option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_exclusion" (
    "option_id" TEXT NOT NULL,
    "other_option_id" TEXT NOT NULL,

    CONSTRAINT "option_exclusion_pkey" PRIMARY KEY ("option_id","other_option_id")
);

-- CreateTable
CREATE TABLE "option_prerequisite" (
    "option_id" TEXT NOT NULL,
    "required_option_id" TEXT NOT NULL,

    CONSTRAINT "option_prerequisite_pkey" PRIMARY KEY ("option_id","required_option_id")
);

-- CreateTable
CREATE TABLE "discount_rule" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "rate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "min_qty" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "discount_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote" (
    "id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "customer_email" TEXT,
    "subtotal" INTEGER NOT NULL,
    "discount_amount" INTEGER NOT NULL,
    "total_amount" INTEGER NOT NULL,
    "applied_discount_id" TEXT,
    "snapshot" JSONB NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_item" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "base_price" INTEGER NOT NULL,
    "option_amount" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "applied_options" JSONB NOT NULL,

    CONSTRAINT "quote_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_code_key" ON "product"("code");

-- CreateIndex
CREATE INDEX "price_tier_product_id_effective_from_idx" ON "price_tier"("product_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "price_tier_product_id_min_qty_effective_from_key" ON "price_tier"("product_id", "min_qty", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "option_group_product_id_code_key" ON "option_group"("product_id", "code");

-- CreateIndex
CREATE INDEX "product_option_group_id_effective_from_idx" ON "product_option"("group_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "product_option_group_id_code_effective_from_key" ON "product_option"("group_id", "code", "effective_from");

-- CreateIndex
CREATE INDEX "discount_rule_product_id_effective_from_idx" ON "discount_rule"("product_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "discount_rule_product_id_code_effective_from_key" ON "discount_rule"("product_id", "code", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "quote_public_id_key" ON "quote"("public_id");

-- CreateIndex
CREATE INDEX "quote_status_created_at_idx" ON "quote"("status", "created_at");

-- CreateIndex
CREATE INDEX "quote_item_quote_id_idx" ON "quote_item"("quote_id");

-- AddForeignKey
ALTER TABLE "price_tier" ADD CONSTRAINT "price_tier_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_group" ADD CONSTRAINT "option_group_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option" ADD CONSTRAINT "product_option_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "option_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_exclusion" ADD CONSTRAINT "option_exclusion_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "product_option"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_exclusion" ADD CONSTRAINT "option_exclusion_other_option_id_fkey" FOREIGN KEY ("other_option_id") REFERENCES "product_option"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_prerequisite" ADD CONSTRAINT "option_prerequisite_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "product_option"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_prerequisite" ADD CONSTRAINT "option_prerequisite_required_option_id_fkey" FOREIGN KEY ("required_option_id") REFERENCES "product_option"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_rule" ADD CONSTRAINT "discount_rule_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_item" ADD CONSTRAINT "quote_item_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_item" ADD CONSTRAINT "quote_item_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
