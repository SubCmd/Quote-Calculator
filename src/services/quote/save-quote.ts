import { createQuote } from "@/repositories/quote";
import { estimate } from "../pricing/estimate";
import type { Violation } from "../pricing/types";
import { expiresAtFrom } from "./expiry";
import type { QuoteSnapshot, SaveQuoteInput } from "./types";

export type SaveQuoteResult =
  | { ok: true; publicId: string }
  | { ok: false; violations: Violation[] };

/**
 * 견적 저장. 금액은 **클라이언트가 보낸 값을 쓰지 않고 여기서 다시 계산한다.** (ADR-0003)
 * 계산할 수 없는 선택이면 저장하지 않는다. 0원으로 저장하지 않는다.
 */
export async function saveQuote(
  input: SaveQuoteInput,
  now: Date,
): Promise<SaveQuoteResult> {
  const result = await estimate(
    { productId: input.productId, optionIds: input.optionIds },
    now,
  );

  if (!result.ok) return result;

  const snapshot: QuoteSnapshot = {
    input: { productId: input.productId, optionIds: input.optionIds },
    appliedDiscount: result.appliedDiscount,
    discountCandidates: result.discountCandidates,
    pricingRuleVersionIds: result.pricingRuleVersionIds,
  };

  const publicId = await createQuote({
    customer: input.customer,
    // 동의 시각은 저장 시각이다. 서비스 안에서 시각을 읽지 않는다. (ADR-0018)
    privacyConsentAt: now,
    items: result.items.map((item) => ({
      productId: item.productId,
      optionAmount: item.optionAmount,
      subtotal: item.subtotal,
      appliedOptions: item.appliedOptions,
    })),
    subtotal: result.subtotal,
    discountAmount: result.discountAmount,
    totalAmount: result.totalAmount,
    appliedDiscountId: result.appliedDiscount?.discountId ?? null,
    snapshot,
    calculatedAt: result.calculatedAt,
    expiresAt: expiresAtFrom(result.calculatedAt),
  });

  return { ok: true, publicId };
}
