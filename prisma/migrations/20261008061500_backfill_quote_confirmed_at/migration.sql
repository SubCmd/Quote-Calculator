-- 기존 CONFIRMED 행에 확정 시각을 채운다. (ADR-0022)
-- 보존기간 5년의 기준점이 비어 있으면 그 행은 영원히 파기 대상이 되지 않는다.

-- 1순위: 감사 로그에 남은 CONFIRMED 전이 시각.
-- 같은 견적이 여러 번 기록될 일은 없지만(종착 상태), 안전하게 가장 이른 것을 쓴다.
UPDATE "quote" q
SET "confirmed_at" = sub."changed_at"
FROM (
  SELECT a."target_id" AS "public_id", MIN(a."created_at") AS "changed_at"
  FROM "audit_log" a
  WHERE a."action" = 'QUOTE_STATUS_CHANGED'
    AND a."target_type" = 'Quote'
    AND a."after_value" ->> 'status' = 'CONFIRMED'
  GROUP BY a."target_id"
) AS sub
WHERE q."public_id" = sub."public_id"
  AND q."status" = 'CONFIRMED'
  AND q."confirmed_at" IS NULL;

-- 2순위: 로그가 없으면 updated_at. 정확하지 않지만 NULL 로 두는 것보다 낫다.
-- NULL 은 "파기하지 않음"으로 동작해서 보관기간을 넘긴다.
UPDATE "quote"
SET "confirmed_at" = "updated_at"
WHERE "status" = 'CONFIRMED'
  AND "confirmed_at" IS NULL;
