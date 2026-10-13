import { findQuoteByPublicId } from "@/repositories/quote";
import { displayStatus } from "./expiry";
import type { SavedQuote } from "./types";

/**
 * 저장된 견적을 그대로 돌려준다. **다시 계산하지 않는다.**
 * 가격 규칙이 새 버전으로 바뀌어도 발행 당시 금액을 보여줘야 한다. (ADR-0002)
 */
export async function getQuote(
  publicId: string,
  now: Date,
): Promise<SavedQuote | null> {
  const quote = await findQuoteByPublicId(publicId);
  if (!quote) return null;

  return {
    publicId: quote.publicId,
    status: displayStatus(quote.status, quote.expiresAt, now),
    storedStatus: quote.status,
    items: quote.items,
    subtotal: quote.subtotal,
    discountAmount: quote.discountAmount,
    appliedDiscount: quote.snapshot.appliedDiscount,
    totalAmount: quote.totalAmount,
    calculatedAt: quote.calculatedAt,
    expiresAt: quote.expiresAt,
    paymentMethod: quote.paymentMethod,
  };
}
