import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { discountVersionSchema, optionVersionSchema } from '@/lib/validation/admin';
import { saveDiscountVersion, saveOptionVersion } from '@/services/admin/pricing-admin';

const ACTOR = 'admin';

/**
 * 가격 규칙 새 버전 추가. 기존 행을 UPDATE 하지 않는다. (ADR-0002)
 * 레이아웃·미들웨어 검사에 기대지 않고 여기서 다시 권한을 본다. (.claude/rules/admin.md)
 */
export async function POST(request: Request) {
  const now = new Date();
  if (!(await isAdmin(now))) {
    return NextResponse.json({ ok: false, error: '권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json();

  if (body?.kind === 'option') {
    const parsed = optionVersionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: '입력값이 올바르지 않습니다.', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    await saveOptionVersion(parsed.data, ACTOR, now);
    return NextResponse.json({ ok: true });
  }

  if (body?.kind === 'discount') {
    const parsed = discountVersionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: '입력값이 올바르지 않습니다.', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    await saveDiscountVersion(parsed.data, ACTOR, now);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: '대상이 올바르지 않습니다.' }, { status: 400 });
}
