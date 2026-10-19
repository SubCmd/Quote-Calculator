-- 고를 것이 없는 안내 전용 단계 여부. (ADR-0048)
-- 기본값이 false 라 기존 행 백필이 필요 없다. 고를 수 있는 단계가 기본이다.
ALTER TABLE "option_group" ADD COLUMN     "notice_only" BOOLEAN NOT NULL DEFAULT false;
