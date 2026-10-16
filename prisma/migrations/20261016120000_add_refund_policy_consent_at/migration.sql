-- 취소·환불 규정 동의 시각. (ADR-0042)
-- 기존 행은 NULL 이 정상이다. 환불 규정 고지 도입 전에 만들어진 견적이고,
-- 받지 않은 동의를 백필하면 받은 것으로 읽힌다.
ALTER TABLE "quote" ADD COLUMN     "refund_policy_consent_at" TIMESTAMP(3);
