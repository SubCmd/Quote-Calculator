-- 선행 조건을 선행 그룹 안의 옵션 하나로 좁힌다. (ADR-0044)
-- null 이면 지금 그대로 '그룹에 선택이 있으면 충족' 이라서 백필이 필요 없다. (ADR-0010)
--
-- 옵션 행 id 가 아니라 코드다. ProductOption 은 버전 테이블이라 금액 버전을 추가하면
-- id 가 바뀐다. (ADR-0009) 그래서 외래 키를 걸 수 없고 조회 시점에 해석한다.
-- 해석되지 않으면 그 그룹을 잠근다. 조건을 못 읽을 때 과하게 파는 쪽이 아니라
-- 팔지 않는 쪽이 안전하다.
ALTER TABLE "option_group" ADD COLUMN     "depends_on_option_code" TEXT;
