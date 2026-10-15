import { findBundleSuggestions } from "./bundle";
import { validateSelection } from "./constraints";
import { priceSelection } from "./price-selection";
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

  const priced = priceSelection(ruleSet, input.optionIds);

  return {
    ok: true,
    items: [
      {
        productId: ruleSet.product.id,
        optionAmount: priced.optionAmount,
        subtotal: priced.subtotal,
        appliedOptions: priced.appliedOptions,
      },
    ],
    subtotal: priced.subtotal,
    discountAmount: priced.discountAmount,
    appliedDiscount: priced.appliedDiscount,
    discountCandidates: priced.discountCandidates,
    totalAmount: priced.totalAmount,
    // 안내는 금액 뒤에 붙는다. 총액에 들어가지 않는다. (ADR-0037)
    bundleSuggestions: findBundleSuggestions(
      ruleSet,
      input.optionIds,
      priced.totalAmount,
    ),
    pricingRuleVersionIds: [
      ...priced.selectedOptions.map((o) => o.versionId),
      ...(priced.appliedDiscount
        ? [
            ruleSet.discounts.find(
              (d) => d.id === priced.appliedDiscount!.discountId,
            )!.versionId,
          ]
        : []),
    ],
    calculatedAt: now,
  };
}
