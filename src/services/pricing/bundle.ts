import { validateSelection } from "./constraints";
import { priceSelection } from "./price-selection";
import type { BundleSuggestion, RuleSet } from "./types";

/**
 * 구성 옵션을 전부 고른 선택에 더 싼 묶음 옵션을 안내한다. (ADR-0037, docs/pricing-rules.md 10절)
 * 순수 함수다. 금액을 바꾸지 않고, 총액은 고객이 실제로 고른 옵션의 합 그대로다.
 *
 * 절약액은 **두 총액의 차이**다. 구성 옵션 금액의 차를 따로 빼지 않는다.
 * 그 식은 10원 단위 버림(ADR-0007)과 할인 변화를 담지 못해서, 화면에 적는
 * "얼마가 줄어든다" 가 거짓이 될 수 있다.
 *
 * 바꾼 선택이 제약을 위반하면 안내하지 않는다. 묶음 옵션이 단일 선택 그룹에 있거나,
 * 구성 옵션을 빼면서 다른 그룹의 선행 조건이 깨지는 경우가 여기서 걸린다. (ADR-0010)
 * 묶음 옵션 id 가 이 상품에 없는 경우도 `UNKNOWN_OPTION` 으로 같이 걸린다.
 */
export function findBundleSuggestions(
  ruleSet: RuleSet,
  selectedOptionIds: string[],
  currentTotal: number,
): BundleSuggestion[] {
  const selected = new Set(selectedOptionIds);
  const suggestions: BundleSuggestion[] = [];

  for (const bundle of ruleSet.bundles) {
    // 대체할 것이 없는 묶음은 안내할 내용이 없다. 조건이 비면 항상 후보가 되는 할인과 반대다.
    if (bundle.componentOptionIds.length === 0) continue;
    if (selected.has(bundle.optionId)) continue;
    if (!bundle.componentOptionIds.every((id) => selected.has(id))) continue;

    const components = new Set(bundle.componentOptionIds);
    const nextOptionIds = [
      ...selectedOptionIds.filter((id) => !components.has(id)),
      bundle.optionId,
    ];

    if (validateSelection(ruleSet, nextOptionIds).length > 0) continue;

    const savingAmount =
      currentTotal - priceSelection(ruleSet, nextOptionIds).totalAmount;
    if (savingAmount <= 0) continue;

    suggestions.push({
      optionId: bundle.optionId,
      // 위 검증을 통과했으므로 이 상품의 옵션이다.
      name: ruleSet.options.find((o) => o.id === bundle.optionId)!.name,
      nextOptionIds,
      savingAmount,
    });
  }

  // 같은 입력이 항상 같은 순서를 내야 한다. 절약액이 큰 순, 동률이면 옵션 id 순이다.
  return suggestions.sort(
    (a, b) =>
      b.savingAmount - a.savingAmount || a.optionId.localeCompare(b.optionId),
  );
}
