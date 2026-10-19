import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { exportQuotes } from "@/services/quote/admin-quotes";
import { parseQuoteSearch } from "@/services/quote/list-query";

const ACTOR = "admin";

/**
 * 좁힌 조건의 견적 목록을 CSV 로 내려준다. (ADR-0050)
 *
 * 조건 해석은 목록 화면과 **같은 함수**다. 두 번 적으면 화면에서 좁힌 것과 파일에
 * 담긴 것이 어긋나고, 어긋나도 아무 에러가 나지 않아서 담당자는 알 수 없다.
 * `page` 는 읽지 않는다. 파일에 페이지가 없다.
 *
 * 미들웨어는 쿠키 존재만 보므로 여기서 다시 권한을 확인한다. (ADR-0011)
 */
export async function GET(request: Request) {
  const now = new Date();
  if (!(await isAdmin(now))) {
    return NextResponse.json(
      { ok: false, error: "권한이 없습니다." },
      { status: 403 },
    );
  }

  const params = new URL(request.url).searchParams;
  const search = parseQuoteSearch({
    status: params.get("status") ?? undefined,
    name: params.get("name") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    hidden: params.get("hidden") ?? undefined,
    product: params.get("product") ?? undefined,
    phone: params.get("phone") ?? undefined,
    payment: params.get("payment") ?? undefined,
  });

  const result = await exportQuotes(search, ACTOR, now);

  // 상한을 넘으면 파일을 만들지 않는다. 내보낸 것이 없으므로 기록도 남지 않는다.
  if (!result.ok) return NextResponse.json(result, { status: 413 });

  return new NextResponse(result.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      // 조건이 같아도 목록은 계속 바뀐다. 내려받은 파일이 캐시에 남지 않게 한다.
      "Cache-Control": "no-store",
    },
  });
}
