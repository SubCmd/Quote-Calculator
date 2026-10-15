/**
 * 10원 단위 버림. (ADR-0007)
 *
 * 계산 순서의 적용 지점은 항목 소계와 할인액 두 곳뿐이다.
 * 셋째 호출부는 `payment-amount.ts` 의 카드 금액이고, 그것은 계산이 아니라
 * 지불 금액의 표기라서 소계·할인 순서에 끼어들지 않는다. (ADR-0039)
 * 그 밖에서는 호출하지 않는다.
 */

export const ROUNDING_UNIT = 10;

export function floorToUnit(amount: number): number {
  return Math.floor(amount / ROUNDING_UNIT) * ROUNDING_UNIT;
}
