-- DropForeignKey
ALTER TABLE "option_exclusion" DROP CONSTRAINT "option_exclusion_option_id_fkey";

-- DropForeignKey
ALTER TABLE "option_exclusion" DROP CONSTRAINT "option_exclusion_other_option_id_fkey";

-- DropForeignKey
ALTER TABLE "option_prerequisite" DROP CONSTRAINT "option_prerequisite_option_id_fkey";

-- DropForeignKey
ALTER TABLE "option_prerequisite" DROP CONSTRAINT "option_prerequisite_required_option_id_fkey";

-- DropForeignKey
ALTER TABLE "price_tier" DROP CONSTRAINT "price_tier_product_id_fkey";

-- AlterTable
ALTER TABLE "discount_rule" DROP COLUMN "min_qty";

-- AlterTable
ALTER TABLE "product" DROP COLUMN "max_qty",
DROP COLUMN "min_qty",
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "product_option" DROP COLUMN "price_type",
DROP COLUMN "rate";

-- AlterTable
ALTER TABLE "quote_item" DROP COLUMN "base_price",
DROP COLUMN "quantity",
DROP COLUMN "unit_price";

-- DropTable
DROP TABLE "option_exclusion";

-- DropTable
DROP TABLE "option_prerequisite";

-- DropTable
DROP TABLE "price_tier";

-- DropEnum
DROP TYPE "OptionPriceType";

-- CreateTable
CREATE TABLE "discount_condition" (
    "id" TEXT NOT NULL,
    "discount_rule_id" TEXT NOT NULL,
    "group_code" TEXT NOT NULL,
    "option_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discount_condition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discount_condition_discount_rule_id_group_code_option_code_key" ON "discount_condition"("discount_rule_id", "group_code", "option_code");

-- AddForeignKey
ALTER TABLE "discount_condition" ADD CONSTRAINT "discount_condition_discount_rule_id_fkey" FOREIGN KEY ("discount_rule_id") REFERENCES "discount_rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

