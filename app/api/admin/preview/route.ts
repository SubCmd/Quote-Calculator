import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { previewSchema } from '@/lib/validation/admin';
import { previewChange } from '@/services/admin/pricing-admin';

/** 저장 전 미리보기. 아무것도 저장하지 않는다. 계산은 /api/estimate 와 같은 Service 다. */
export async function POST(request: Request) {
  const now = new Date();
  if (!(await isAdmin(now))) {
    return NextResponse.json({ ok: false, error: '권한이 없습니다.' }, { status: 403 });
  }

  const parsed = previewSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: '입력값이 올바르지 않습니다.' }, { status: 400 });
  }

  const result = await previewChange(
    parsed.data.productId,
    parsed.data.optionIds,
    parsed.data.change,
    now,
  );
  if (!result) {
    return NextResponse.json({ ok: false, error: '상품을 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    before: result.before.ok ? { totalAmount: result.before.totalAmount } : null,
    after: result.after.ok ? { totalAmount: result.after.totalAmount } : null,
  });
}
