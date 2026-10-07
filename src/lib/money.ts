/**
 * 금액은 원 단위 정수, 부가세 포함. (ADR-0001, ADR-0005)
 * 요율은 만분율 정수(bp)로 받는다. 10% = 1000. 부동소수점 오차를 만들지 않기 위함이다.
 */

export const BP_DENOMINATOR = 10_000;

export function applyRate(amount: number, rateBp: number): number {
  return Math.floor((amount * rateBp) / BP_DENOMINATOR);
}

export function toBp(rate: number): number {
  return Math.round(rate * BP_DENOMINATOR);
}

export function formatKRW(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}
