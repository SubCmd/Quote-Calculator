import { NextResponse } from "next/server";
import { saveQuoteSchema } from "@/lib/validation/quote";
import { saveQuote } from "@/services/quote/save-quote";

/** 견적 저장. 금액은 클라이언트가 보낸 값을 쓰지 않고 서버에서 다시 계산한다. (ADR-0003) */
export async function POST(request: Request) {
  const parsed = saveQuoteSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const result = await saveQuote(parsed.data, new Date());

  if (!result.ok) {
    return NextResponse.json(result, { status: 422 });
  }

  return NextResponse.json(result, { status: 201 });
}
