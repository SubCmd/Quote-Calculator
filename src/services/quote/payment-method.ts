import type { PaymentMethod } from "@prisma/client";
import { paymentMethodLabel } from "@/lib/payment-method";
import {
  findVisibleQuoteStatus,
  updateQuotePaymentMethod,
} from "@/repositories/quote";

export type SelectPaymentMethodResult =
  | { ok: true; paymentMethod: PaymentMethod }
  | {
      ok: false;
      /** API Route 가 상태 코드를 고를 수 있도록 사유를 구분해 둔다. */
      reason: "not-found" | "not-allowed" | "conflict";
    };

/**
 * 결제 방식 선택. 고객(`/q/[publicId]`)과 관리자가 같은 함수를 쓴다. (ADR-0033)
 * `REQUESTED` 에서만 고를 수 있다. 확정된 견적의 결제 방식을 바꾸지 않는다.
 *
 * 사유 문장을 돌려주지 않는다. 공개 경로가 호출하므로 화면 문구는 호출하는 쪽이
 * 상태 코드로 고른다. (ADR-0021)
 */
export async function selectPaymentMethod(
  publicId: string,
  paymentMethod: PaymentMethod,
  actor: string,
): Promise<SelectPaymentMethodResult> {
  // 숨긴 견적은 없는 것으로 다룬다. 받을 사람이 없는 선택을 저장하지 않는다. (ADR-0035)
  const current = await findVisibleQuoteStatus(publicId);
  if (current === null) return { ok: false, reason: "not-found" };
  if (current !== "REQUESTED") return { ok: false, reason: "not-allowed" };

  const changed = await updateQuotePaymentMethod(
    publicId,
    paymentMethod,
    actor,
    `견적 ${publicId} 결제 방식 ${paymentMethodLabel(paymentMethod)} 선택`,
  );

  // 조회와 변경 사이에 누가 상태를 먼저 바꿨다. 덮어쓰지 않고 거부한다.
  if (!changed) return { ok: false, reason: "conflict" };

  return { ok: true, paymentMethod };
}
