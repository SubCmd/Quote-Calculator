import { createClonedQuote, findQuoteDetail } from "@/repositories/quote";
import { estimate } from "../pricing/estimate";
import type { Violation } from "../pricing/types";
import { expiresAtFrom } from "./expiry";
import type { QuoteSnapshot } from "./types";

export type CloneQuoteResult =
  | { ok: true; publicId: string }
  | {
      ok: false;
      /** API Route 가 상태 코드를 고를 수 있도록 사유를 구분해 둔다. */
      reason: "not-found" | "contact-purged" | "not-calculable";
      error: string;
      violations?: Violation[];
    };

/**
 * 견적 복제. 선택과 연락처만 가져오고 **금액은 지금 가격 규칙으로 다시 계산한다.** (ADR-0014)
 * 금액을 복사하는 경로를 만들지 않는다. 원본은 상태도 금액도 그대로 둔다.
 */
export async function cloneQuote(
  publicId: string,
  actor: string,
  now: Date,
): Promise<CloneQuoteResult> {
  const origin = await findQuoteDetail(publicId);
  if (!origin)
    return {
      ok: false,
      reason: "not-found",
      error: "견적을 찾을 수 없습니다.",
    };

  // 보관 기간이 지나 연락처가 파기된 견적이다. (ADR-0013)
  // 복제는 연락처 승계가 전제라 되살릴 값이 없다. 빈 값으로 저장하지 않는다.
  if (origin.customerName === null || origin.customerPhone === null)
    return {
      ok: false,
      reason: "contact-purged",
      error:
        "연락처가 파기된 견적은 복제할 수 없습니다. 고객용 계산기에서 새로 작성해 주세요.",
    };

  const result = await estimate(origin.snapshot.input, now);

  // 옵션이 비활성화됐거나 사라졌다. 0원이나 옛 금액으로 저장하지 않는다. (ADR-0014)
  if (!result.ok)
    return {
      ok: false,
      reason: "not-calculable",
      error:
        "지금 가격 규칙으로 계산할 수 없는 선택입니다. 복제하지 않았습니다.",
      violations: result.violations,
    };

  const snapshot: QuoteSnapshot = {
    input: origin.snapshot.input,
    appliedDiscount: result.appliedDiscount,
    discountCandidates: result.discountCandidates,
    pricingRuleVersionIds: result.pricingRuleVersionIds,
    clonedFromPublicId: origin.publicId,
  };

  const cloned = await createClonedQuote(
    {
      customer: {
        name: origin.customerName,
        phone: origin.customerPhone,
        email: origin.customerEmail,
      },
      // 복제는 담당자 행위다. 새로 수집한 개인정보가 없으므로 원본의 동의를 승계한다. (ADR-0018)
      privacyConsentAt: origin.privacyConsentAt,
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
    },
    { publicId: origin.publicId, totalAmount: origin.totalAmount },
    actor,
  );

  return { ok: true, publicId: cloned };
}
