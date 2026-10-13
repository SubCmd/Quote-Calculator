-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'DESCRIPTION_UPDATED';

-- AlterTable
ALTER TABLE "option_group" ADD COLUMN     "detail" TEXT,
ADD COLUMN     "summary" TEXT;

-- CreateTable
CREATE TABLE "option_description" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "option_code" TEXT NOT NULL,
    "summary" TEXT,
    "detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "option_description_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "option_description_group_id_option_code_key" ON "option_description"("group_id", "option_code");

-- AddForeignKey
ALTER TABLE "option_description" ADD CONSTRAINT "option_description_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "option_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

