import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { paymentMethodSchema } from "@/lib/validation/admin";
import { selectPaymentMethod } from "@/services/quote/payment-method";

const ACTOR = "admin";

const STATUS_BY_REASON = {
  "not-found": 404,
  "not-allowed": 422,
  conflict: 409,
} as const;

/**
 * 담당자가 대신 결제 방식을 고른다. 고객도 `/api/quote/[publicId]/payment-method`
 * 로 같은 일을 할 수 있고, 둘 다 같은 Service 를 쓴다. (ADR-0033)
 * 권한은 Route 에서 다시 확인한다. (`.claude/rules/admin.md`)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  if (!(await isAdmin(new Date()))) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const parsed = paymentMethodSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { publicId } = await params;
  const result = await selectPaymentMethod(
    publicId,
    parsed.data.paymentMethod,
    ACTOR,
  );

  if (result.ok) return NextResponse.json(result);

  return NextResponse.json(result, {
    status: STATUS_BY_REASON[result.reason],
  });
}
