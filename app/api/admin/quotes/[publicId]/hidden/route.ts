import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { quoteHiddenSchema } from "@/lib/validation/admin";
import { setQuoteVisibility } from "@/services/quote/admin-quotes";

const ACTOR = "admin";

/**
 * 견적 숨기기·되돌리기. 행을 지우는 경로는 만들지 않는다. (ADR-0035)
 * 레이아웃·미들웨어 검사에 기대지 않고 여기서 다시 권한을 본다.
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

  const parsed = quoteHiddenSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const { publicId } = await params;
  const result = await setQuoteVisibility(publicId, parsed.data.hidden, ACTOR);

  if (result.ok) return NextResponse.json(result);

  const status = { "not-found": 404, conflict: 409 }[result.reason];
  return NextResponse.json(result, { status });
}
