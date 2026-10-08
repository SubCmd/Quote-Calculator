-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'PRIVACY_PURGED';

-- AlterTable
ALTER TABLE "quote" ADD COLUMN     "confirmed_at" TIMESTAMP(3),
ADD COLUMN     "purged_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "quote_status_confirmed_at_idx" ON "quote"("status", "confirmed_at");
