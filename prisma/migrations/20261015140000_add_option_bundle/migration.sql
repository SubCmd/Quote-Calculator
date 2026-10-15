-- CreateTable
CREATE TABLE "option_bundle" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "group_code" TEXT NOT NULL,
    "option_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "option_bundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_bundle_component" (
    "id" TEXT NOT NULL,
    "bundle_id" TEXT NOT NULL,
    "group_code" TEXT NOT NULL,
    "option_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "option_bundle_component_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "option_bundle_product_id_group_code_option_code_key" ON "option_bundle"("product_id", "group_code", "option_code");

-- CreateIndex
CREATE UNIQUE INDEX "option_bundle_component_bundle_id_group_code_option_code_key" ON "option_bundle_component"("bundle_id", "group_code", "option_code");

-- AddForeignKey
ALTER TABLE "option_bundle" ADD CONSTRAINT "option_bundle_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_bundle_component" ADD CONSTRAINT "option_bundle_component_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "option_bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

