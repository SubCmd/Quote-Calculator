import { paymentMethodSchema } from "@/lib/validation/admin";
import { selectPaymentMethod } from "@/services/quote/payment-method";

export const dynamic = "force-dynamic";

const STATUS_BY_REASON = {
  "not-found": 404,
  "not-allowed": 422,
  conflict: 409,
} as const;

/**
 * 고객이 자기 견적에서 결제 방식을 고른다. 인증이 없는 공개 경로다. (ADR-0033)
 *
 * 보호는 `publicId` 가 추측 불가능한 것(ADR-0013)에 의존한다. 그 주소를 가진 사람은
 * 그 견적의 고객이다. 금액·선택 내역은 건드리지 않고 결제 방식 한 칸만 쓴다.
 *
 * **본문에 사유 문장을 담지 않는다.** 화면 문구는 호출하는 쪽이 상태 코드로 고른다. (ADR-0021)
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await params;

  const parsed = paymentMethodSchema.safeParse(await req.json());
  if (!parsed.success) return new Response(null, { status: 400 });

  const result = await selectPaymentMethod(
    publicId,
    parsed.data.paymentMethod,
    "customer",
  );

  if (!result.ok) {
    return new Response(null, { status: STATUS_BY_REASON[result.reason] });
  }

  return Response.json({ paymentMethod: result.paymentMethod });
}
