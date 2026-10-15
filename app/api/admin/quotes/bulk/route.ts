import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { quoteBulkActionSchema } from "@/lib/validation/admin";
import {
  bulkDeleteQuotes,
  bulkHideQuotes,
} from "@/services/quote/admin-quotes";

const ACTOR = "admin";

/**
 * 목록에서 고른 견적을 한꺼번에 숨기거나 지운다. (ADR-0041)
 *
 * 삭제 가능 여부는 **여기서 다시 판단한다.** 목록이 낡은 사이에 상태가 바뀌었을 수 있고,
 * 화면의 버튼 비활성은 보조다. 레이아웃·미들웨어 검사에도 기대지 않는다.
 */
export async function POST(request: Request) {
  if (!(await isAdmin(new Date()))) {
    return NextResponse.json(
      { ok: false, error: "권한이 없습니다." },
      { status: 403 },
    );
  }

  const parsed = quoteBulkActionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const { action, publicIds } = parsed.data;
  const result =
    action === "delete"
      ? await bulkDeleteQuotes(publicIds, ACTOR)
      : await bulkHideQuotes(publicIds, ACTOR);

  if (result.ok) return NextResponse.json(result);

  const status = { "not-found": 404, blocked: 422, conflict: 409 }[
    result.reason
  ];
  return NextResponse.json(result, { status });
}
