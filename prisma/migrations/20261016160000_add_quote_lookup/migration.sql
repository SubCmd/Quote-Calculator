-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'QUOTE_LOOKED_UP';

-- CreateTable
CREATE TABLE "quote_lookup_attempt" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_lookup_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quote_lookup_attempt_created_at_idx" ON "quote_lookup_attempt"("created_at");

-- CreateIndex
CREATE INDEX "quote_lookup_attempt_ip_created_at_idx" ON "quote_lookup_attempt"("ip", "created_at");
