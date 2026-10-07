import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./auth-cookie";

/**
 * 관리자 인증. 지금은 공유 비밀번호 하나다. (ADR-0011)
 * 인증 방식이 바뀌어도 이 파일 밖은 고치지 않는다.
 */

export { SESSION_COOKIE };

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

/** 비밀번호나 서명 키가 없으면 관리자 영역을 통째로 닫는다. 기본 차단이다. */
export function isAdminConfigured(): boolean {
  return Boolean(
    process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET,
  );
}

function sign(expiresAt: number): string {
  const secret = process.env.ADMIN_SESSION_SECRET!;
  return createHmac("sha256", secret).update(String(expiresAt)).digest("hex");
}

function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // 길이가 다르면 timingSafeEqual 이 예외를 던진다. 길이 자체는 비밀이 아니다.
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyPassword(input: string): boolean {
  if (!isAdminConfigured()) return false;
  return equals(input, process.env.ADMIN_PASSWORD!);
}

export function issueSession(now: Date): { value: string; maxAge: number } {
  const expiresAt = now.getTime() + SESSION_MAX_AGE_SECONDS * 1000;
  return {
    value: `${expiresAt}.${sign(expiresAt)}`,
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

function isValidSession(raw: string | undefined, now: Date): boolean {
  if (!isAdminConfigured() || !raw) return false;

  const [expiresAtRaw, signature] = raw.split(".");
  if (!expiresAtRaw || !signature) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return false;

  return equals(signature, sign(expiresAt));
}

/** 현재 요청이 ADMIN 인지. API Route 와 Server Component 가 각각 직접 부른다. */
export async function isAdmin(now: Date): Promise<boolean> {
  const store = await cookies();
  return isValidSession(store.get(SESSION_COOKIE)?.value, now);
}
