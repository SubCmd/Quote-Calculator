import { applyRate } from "@/lib/money";
import { floorToUnit } from "./rounding";

/**
 * 카드 결제 금액. 현금가에 부가세 10%를 더한다. (ADR-0039)
 *
 * 계산 결과가 아니라 지불 금액의 표기다. 소계·할인·총액 계산 순서에 끼어들지 않고,
 * DB 에도 견적 스냅샷에도 저장하지 않는다. 현금가에서 언제든 다시 구한다.
 *
 * 10원 단위 버림을 쓴다. 총액은 항상 10원 단위인데(ADR-0007) 1.1 을 곱하면 그 단위가
 * 깨진다(210 → 231). 버림이라 고객이 더 내는 쪽으로는 틀리지 않는다.
 */
export const CARD_VAT_RATE_BP = 1000;

export function cardPaymentAmount(cashAmount: number): number {
  return floorToUnit(cashAmount + applyRate(cashAmount, CARD_VAT_RATE_BP));
}
