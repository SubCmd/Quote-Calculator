import { resolveDiscount } from "./discount";
import { calculateOptionAmount } from "./options";
import { floorToUnit } from "./rounding";
import type {
  AppliedOption,
  DiscountCandidate,
  OptionRule,
  RuleSet,
} from "./types";

export interface PricedSelection {
  selectedOptions: OptionRule[];
  /** 선택 옵션 금액의 합. 버림 전 */
  optionAmount: number;
  appliedOptions: AppliedOption[];
  /** 10원 단위 버림 적용 후 */
  subtotal: number;
  discountAmount: number;
  appliedDiscount: DiscountCandidate | null;
  discountCandidates: DiscountCandidate[];
  /** 최종 현금가 (ADR-0039) */
  totalAmount: number;
}

/**
 * 선택 하나의 금액을 낸다. 순수 함수다.
 * 계산 순서는 docs/pricing-rules.md 3절에 고정되어 있다.
 *
 * 본 계산(`calculate`)과 묶음 비교(`bundle`)가 같이 쓴다. (ADR-0037)
 * 묶음 안내의 절약액은 두 총액의 차이라서, 같은 식을 두 군데 적으면 안내한 숫자가
 * 실제 결과와 어긋날 수 있다.
 *
 * **선택 제약은 보지 않는다.** 검증은 `validateSelection` 이 따로 한다.
 */
export function priceSelection(
  ruleSet: RuleSet,
  optionIds: string[],
): PricedSelection {
  const selectedOptions = ruleSet.options.filter((o) =>
    optionIds.includes(o.id),
  );

  const { optionAmount, appliedOptions } =
    calculateOptionAmount(selectedOptions);
  const subtotal = floorToUnit(optionAmount);

  const { discountAmount, appliedDiscount, candidates } = resolveDiscount(
    ruleSet.discounts,
    subtotal,
    optionIds,
  );

  return {
    selectedOptions,
    optionAmount,
    appliedOptions,
    subtotal,
    discountAmount,
    appliedDiscount,
    discountCandidates: candidates,
    totalAmount: subtotal - discountAmount,
  };
}
