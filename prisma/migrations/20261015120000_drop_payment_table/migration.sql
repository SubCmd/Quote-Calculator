-- DropTable
-- 결제선생 연동을 미리 준비하려고 만든 테이블이다. 쓰는 코드가 없고 0행이다. (ADR-0036)
-- 칸 이름(imp_uid, merchant_uid)이 아임포트 규격이라 결제선생 응답을 담을 수 없다.
-- 연동을 시작할 때 실제 응답 형식을 보고 테이블을 다시 설계한다.
-- Quote.payment_method 는 지우지 않는다. 고객이 고른 방식이지 결제 기록이 아니다. (ADR-0033)
DROP TABLE "payment";
