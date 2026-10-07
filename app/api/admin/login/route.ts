import { NextResponse } from 'next/server';
import { SESSION_COOKIE, isAdminConfigured, issueSession, verifyPassword } from '@/lib/auth';
import { loginSchema } from '@/lib/validation/admin';

export async function POST(request: Request) {
  // 비밀번호가 설정되지 않은 환경에서는 로그인 자체가 없다. (ADR-0011)
  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: false, error: '관리자 기능이 비활성화되어 있습니다.' }, { status: 404 });
  }

  const parsed = loginSchema.safeParse(await request.json());
  if (!parsed.success || !verifyPassword(parsed.data.password)) {
    return NextResponse.json({ ok: false, error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  const session = issueSession(new Date());
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: session.maxAge,
  });
  return response;
}
