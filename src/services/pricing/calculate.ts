import { validateSelection } from "./constraints";
import { resolveDiscount } from "./discount";
import { calculateOptionAmount } from "./options";
import { floorToUnit } from "./rounding";
import type { CalculationResult, EstimateInput, RuleSet } from "./types";

/**
 * 순수 함수. DB 조회와 현재 시각 읽기를 하지 않는다.
 * 가격 규칙은 estimate.ts 가 Repository 로 조회해서 넘긴다.
 * 계산 순서는 docs/pricing-rules.md 3절에 고정되어 있다.
 *
 * 선택이 없으면 총액 0원을 성공으로 반환한다. 계산 거부가 아니다. (ADR-0008)
 */
export function calculate(
  input: EstimateInput,
  ruleSet: RuleSet,
  now: Date,
): CalculationResult {
  const violations = validateSelection(ruleSet, input.optionIds);
  if (violations.length > 0) {
    return { ok: false, violations };
  }

  const selectedOptions = ruleSet.options.filter((o) =>
    input.optionIds.includes(o.id),
  );

  const { optionAmount, appliedOptions } =
    calculateOptionAmount(selectedOptions);
  const subtotal = floorToUnit(optionAmount);

  const { discountAmount, appliedDiscount, candidates } = resolveDiscount(
    ruleSet.discounts,
    subtotal,
    input.optionIds,
  );

  return {
    ok: true,
    items: [
      {
        productId: ruleSet.product.id,
        optionAmount,
        subtotal,
        appliedOptions,
      },
    ],
    subtotal,
    discountAmount,
    appliedDiscount,
    discountCandidates: candidates,
    totalAmount: subtotal - discountAmount,
    pricingRuleVersionIds: [
      ...selectedOptions.map((o) => o.versionId),
      ...(appliedDiscount
        ? [
            ruleSet.discounts.find((d) => d.id === appliedDiscount.discountId)!
              .versionId,
          ]
        : []),
    ],
    calculatedAt: now,
  };
}
