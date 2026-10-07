import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { quoteStatusSchema } from "@/lib/validation/admin";
import { changeQuoteStatus } from "@/services/quote/admin-quotes";

const ACTOR = "admin";

/**
 * 견적 상태 변경. 레이아웃·미들웨어 검사에 기대지 않고 여기서 다시 권한을 본다.
 * 허용되는 전이 판단은 Service 안에 있다. (`docs/architecture.md` 6절)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  if (!(await isAdmin(new Date()))) {
    return NextResponse.json(
      { ok: false, error: "권한이 없습니다." },
      { status: 403 },
    );
  }

  const parsed = quoteStatusSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "허용되지 않는 상태입니다." },
      { status: 400 },
    );
  }

  const { publicId } = await params;
  const result = await changeQuoteStatus(publicId, parsed.data.status, ACTOR);

  if (result.ok) return NextResponse.json(result);

  const status = { "not-found": 404, "not-allowed": 422, conflict: 409 }[
    result.reason
  ];
  return NextResponse.json(result, { status });
}
