/**
 * 관리자 목록에서 고른 견적의 총액 합. (ADR-0049)
 *
 * **가격 계산이 아니다.** 입력은 이미 저장된 `totalAmount` 이고 하는 일은 정수 덧셈뿐이다.
 * 옵션 금액·할인율·10원 버림이 들어가지 않으므로 새 반올림 지점이 생기지 않는다.
 * 그래서 Pricing Service 밖에 있어도 된다.
 *
 * 그래도 **식의 자리는 하나다.** 컴포넌트가 `reduce` 를 직접 적지 않고 이 함수를 부른다.
 * `src/services/` 가 아니라 여기 있는 이유는 선택이 클라이언트 상태라서 클라이언트
 * 컴포넌트가 이 함수를 쓰기 때문이다. (`src/lib/payment-method.ts` 와 같은 이유)
 */

/** 더할 줄. 총액 말고는 보지 않는다. */
export interface SummableRow {
  totalAmount: number;
}

/** 고른 줄이 없으면 0이다. 계산 불가가 아니라 0원이다. */
export function sumTotals(rows: readonly SummableRow[]): number {
  let total = 0;
  for (const row of rows) total += row.totalAmount;
  return total;
}
