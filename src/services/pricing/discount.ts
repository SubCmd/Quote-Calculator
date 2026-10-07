import { applyRate } from "@/lib/money";
import { floorToUnit } from "./rounding";
import type { DiscountCandidate, DiscountRule } from "./types";

interface DiscountResult {
  discountAmount: number;
  appliedDiscount: DiscountCandidate | null;
  candidates: DiscountCandidate[];
}

/**
 * 조건 옵션을 전부 선택한 할인만 후보가 된다. (ADR-0009)
 * 그중 할인액이 가장 큰 것 하나만 적용한다. 중복 적용하지 않는다. (ADR-0006)
 * 동률이면 priority 가 낮은 규칙을 적용해 같은 입력이 같은 결과를 내도록 한다.
 */
export function resolveDiscount(
  discounts: DiscountRule[],
  subtotal: number,
  optionIds: string[],
): DiscountResult {
  const selected = new Set(optionIds);

  const candidates: DiscountCandidate[] = discounts
    .filter((d) => d.requiredOptionIds.every((id) => selected.has(id)))
    .map((d) => ({
      discountId: d.id,
      name: d.name,
      amount: d.type === "RATE" ? applyRate(subtotal, d.rateBp) : d.amount,
      priority: d.priority,
    }));

  const best = candidates.reduce<DiscountCandidate | null>((acc, c) => {
    if (acc === null) return c;
    if (c.amount > acc.amount) return c;
    if (c.amount === acc.amount && c.priority < acc.priority) return c;
    return acc;
  }, null);

  if (best === null) {
    return { discountAmount: 0, appliedDiscount: null, candidates };
  }

  const capped = Math.min(best.amount, subtotal);

  return {
    discountAmount: floorToUnit(capped),
    appliedDiscount: best,
    candidates,
  };
}
