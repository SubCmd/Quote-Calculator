-- 그룹 옵션을 한 번에 켜는 버튼을 둘지 여부. (ADR-0043)
-- 기본값이 false 라 기존 행 백필이 필요 없다. 버튼이 없는 것이 기본이다.
ALTER TABLE "option_group" ADD COLUMN     "select_all" BOOLEAN NOT NULL DEFAULT false;
