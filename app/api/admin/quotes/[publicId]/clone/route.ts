import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { cloneQuote } from "@/services/quote/clone-quote";

const ACTOR = "admin";

/**
 * 견적 복제. 선택만 가져오고 금액은 서버에서 다시 계산한다. (ADR-0014)
 * 입력은 경로의 원본 식별자뿐이다. 금액이나 선택을 본문으로 받지 않는다.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  if (!(await isAdmin(new Date()))) {
    return NextResponse.json(
      { ok: false, error: "권한이 없습니다." },
      { status: 403 },
    );
  }

  const { publicId } = await params;
  const result = await cloneQuote(publicId, ACTOR, new Date());

  if (result.ok) return NextResponse.json(result);

  const status = {
    "not-found": 404,
    "contact-purged": 409,
    "not-calculable": 422,
  }[result.reason];
  return NextResponse.json(result, { status });
}
