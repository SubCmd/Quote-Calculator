import {
  clearLoginFailures,
  deleteLoginFailuresBefore,
  findFailureWindow,
  recordLoginFailure,
} from "@/repositories/admin-login-attempt";
import {
  LOGIN_WINDOW_MINUTES,
  type LoginLock,
  evaluateLoginLock,
} from "./login-throttle";

/**
 * 로그인 시도 제한의 진입점. 기록을 조회해 순수 판정 함수에 넘긴다. (ADR-0020)
 * 판정 규칙은 `login-throttle.ts` 에만 있다. 여기서 횟수를 비교하지 않는다.
 */
export async function checkLoginLock(
  ip: string,
  now: Date,
): Promise<LoginLock> {
  const since = new Date(now.getTime() - LOGIN_WINDOW_MINUTES * 60_000);

  // 창을 벗어난 행은 판정에 쓰이지 않는다. 시도할 때마다 함께 지워 별도 배치를 두지 않는다.
  await deleteLoginFailuresBefore(since);

  const [ipWindow, globalWindow] = await Promise.all([
    findFailureWindow(since, ip),
    findFailureWindow(since),
  ]);

  return evaluateLoginLock(ipWindow, globalWindow, now);
}

export async function registerLoginFailure(ip: string): Promise<void> {
  await recordLoginFailure(ip);
}

/** 성공한 IP 의 실패 기록만 지운다. 전체 누적은 남긴다. (ADR-0020) */
export async function registerLoginSuccess(ip: string): Promise<void> {
  await clearLoginFailures(ip);
}
