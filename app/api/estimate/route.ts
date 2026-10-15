import { NextResponse } from 'next/server';
import { estimateRequestSchema } from '@/lib/validation/estimate';
import { estimate } from '@/services/pricing/estimate';

/** 금액 계산 전용. 아무것도 저장하지 않는다. (docs/architecture.md 3절) */
export async function POST(request: Request) {
  const parsed = estimateRequestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: '요청 형식이 올바르지 않습니다.', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await estimate(parsed.data, new Date());

  if (!result.ok) {
    return NextResponse.json(result, { status: 422 });
  }

  return NextResponse.json(result);
}
