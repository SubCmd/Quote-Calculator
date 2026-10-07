import type { AppliedOption, OptionRule } from "./types";

interface OptionResult {
  optionAmount: number;
  appliedOptions: AppliedOption[];
}

/**
 * 선택한 옵션 금액을 더한다. 옵션은 정액만 가진다. (docs/pricing-rules.md 4절)
 * 수량도 기본가도 없으므로 비율을 곱할 기준값이 존재하지 않는다. (ADR-0008)
 */
export function calculateOptionAmount(selected: OptionRule[]): OptionResult {
  const appliedOptions: AppliedOption[] = selected.map((o) => ({
    optionId: o.id,
    name: o.name,
    amount: o.amount,
  }));

  return {
    optionAmount: appliedOptions.reduce((sum, o) => sum + o.amount, 0),
    appliedOptions,
  };
}
