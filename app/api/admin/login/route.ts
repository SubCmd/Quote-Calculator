import { NextResponse } from 'next/server';
import { SESSION_COOKIE, isAdminConfigured, issueSession, verifyPassword } from '@/lib/auth';
import { clientIp } from '@/lib/client-ip';
import { loginSchema } from '@/lib/validation/admin';
import { checkLoginLock, registerLoginFailure, registerLoginSuccess } from '@/services/admin/login';
import { lockMessage } from '@/services/admin/login-throttle';

export async function POST(request: Request) {
  // 비밀번호가 설정되지 않은 환경에서는 로그인 자체가 없다. (ADR-0011)
  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: false, error: '관리자 기능이 비활성화되어 있습니다.' }, { status: 404 });
  }

  const now = new Date();
  const ip = clientIp(request.headers);

  // 잠겼으면 비밀번호를 비교조차 하지 않는다. 비교하면 응답 시간이 정답을 흘린다. (ADR-0020)
  const lock = await checkLoginLock(ip, now);
  if (lock.locked) {
    return NextResponse.json(
      { ok: false, error: lockMessage(lock) },
      { status: 429, headers: { 'Retry-After': String(lock.retryAfterSeconds) } },
    );
  }

  const parsed = loginSchema.safeParse(await request.json());
  if (!parsed.success || !verifyPassword(parsed.data.password)) {
    await registerLoginFailure(ip);
    return NextResponse.json({ ok: false, error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  await registerLoginSuccess(ip);

  const session = issueSession(now);
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
