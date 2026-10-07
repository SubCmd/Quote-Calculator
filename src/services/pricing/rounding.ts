/**
 * 10원 단위 버림. (ADR-0007)
 * 적용 지점은 항목 소계와 할인액 두 곳뿐이다. 다른 곳에서 호출하지 않는다.
 */

export const ROUNDING_UNIT = 10;

export function floorToUnit(amount: number): number {
  return Math.floor(amount / ROUNDING_UNIT) * ROUNDING_UNIT;
}
