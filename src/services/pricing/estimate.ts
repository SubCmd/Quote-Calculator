import { findRuleSet } from "@/repositories/pricing-rule";
import { calculate } from "./calculate";
import type { CalculationResult, EstimateInput } from "./types";

/**
 * 계산 진입점. 가격 규칙을 조회해 순수 함수 calculate 에 넘긴다.
 * 조회는 여기서만 한다. calculate 내부는 DB를 모른다.
 */
export async function estimate(
  input: EstimateInput,
  now: Date,
): Promise<CalculationResult> {
  const ruleSet = await findRuleSet(input.productId, now);

  if (!ruleSet) {
    return {
      ok: false,
      violations: [
        { code: "UNKNOWN_PRODUCT", message: "상품을 찾을 수 없습니다." },
      ],
    };
  }

  return calculate(input, ruleSet, now);
}
