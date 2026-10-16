-- 올스토리 단계 그룹에만 '모두 선택' 버튼을 켠다. (ADR-0043)
-- 전단계 등록이 가장 흔한 선택이고 전단계 할인도 거기 걸려 있다.
--
-- 1회성 컨설팅의 '분석 항목' 은 켜지 않는다. 그 그룹에는 내신·생활기록부를 합친
-- 묶음 옵션(V1)이 같은 그룹에 있어서, 전부 켜면 같은 상담을 두 번 사게 된다. (ADR-0026, ADR-0037)
--
-- 운영 데이터 변경이고 시드(prisma/seed.ts)의 같은 값과 짝이다. 새로 만든 DB 는 시드가,
-- 이미 있는 DB 는 이 마이그레이션이 채운다.
UPDATE "option_group" g
SET "select_all" = true
FROM "product" p
WHERE g."product_id" = p."id"
  AND g."code" = 'STAGE'
  AND p."code" IN ('ALLSTORY_G2', 'ALLSTORY_G3');
