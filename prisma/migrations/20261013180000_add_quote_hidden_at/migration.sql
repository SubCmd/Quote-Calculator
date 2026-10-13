-- AlterEnum
-- 견적 숨기기·되돌리기 기록. 행을 지우지 않으므로 DELETE 대응 액션은 없다. (ADR-0035)
ALTER TYPE "AuditAction" ADD VALUE 'QUOTE_HIDDEN';
ALTER TYPE "AuditAction" ADD VALUE 'QUOTE_RESTORED';

-- AlterTable
-- 기존 행은 전부 보이는 견적이다. 백필할 값이 NULL 이라 기본값이 필요 없다.
ALTER TABLE "quote" ADD COLUMN "hidden_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "quote_hidden_at_created_at_idx" ON "quote"("hidden_at", "created_at");
