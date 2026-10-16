import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { quoteLookupSchema } from "@/lib/validation/quote-lookup";
import { lookupQuotes } from "@/services/quote/lookup-quote";

/**
 * 고객 플랜 조회. (ADR-0045)
 *
 * `POST` 다. 이름·전화번호를 쿼리 파라미터에 담지 않는다. 담으면 브라우저 방문 기록,
 * 서버 접근 로그, 바깥 링크를 눌렀을 때의 `Referer` 에 남는다.
 *
 * 찾지 못한 이유를 나눠 적지 않는다. 이름이 틀렸는지 번호가 틀렸는지 애초에 없는지를
 * 구분해 주면 `이름은 맞다` 가 응답으로 새어 나간다. 0건은 `plans: []` 로 돌려주고
 * 문구는 화면이 하나로 적는다.
 */
export async function POST(request: Request) {
  const parsed = quoteLookupSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.",
      },
      { status: 400 },
    );
  }

  const result = await lookupQuotes(
    parsed.data,
    clientIp(request.headers),
    new Date(),
  );

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.message },
      {
        status: 429,
        headers: { "Retry-After": String(result.retryAfterSeconds) },
      },
    );
  }

  return NextResponse.json(result);
}
