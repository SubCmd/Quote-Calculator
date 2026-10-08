/**
 * 관리자 로그인 시도 제한. (ADR-0020)
 *
 * 공유 비밀번호 하나로 가격 규칙과 전 고객 연락처가 열리기 때문에(ADR-0011, ADR-0013)
 * 대입 공격을 횟수로 막는다. 판정은 이 파일의 순수 함수 하나에만 있다.
 */

/** 실패를 세는 구간. 잠금이 풀리는 시간도 이 길이다. */
export const LOGIN_WINDOW_MINUTES = 10;

/** 같은 IP 에 허용하는 실패 횟수. */
export const IP_FAILURE_LIMIT = 5;

/**
 * 출처와 무관하게 허용하는 실패 횟수.
 * IP 는 헤더라서 위조될 수 있다. 위조해도 여기서 멈춘다.
 */
export const GLOBAL_FAILURE_LIMIT = 20;

/** 창 안의 실패 집계. `newestAt` 은 잠금이 풀리는 시각을 구하는 데 쓴다. */
export interface FailureWindow {
  count: number;
  newestAt: Date | null;
}

export type LoginLock =
  | { locked: false }
  | {
      locked: true;
      scope: "IP" | "GLOBAL";
      retryAfterSeconds: number;
    };

function lockedUntil(window: FailureWindow): Date | null {
  if (window.newestAt === null) return null;
  return new Date(window.newestAt.getTime() + LOGIN_WINDOW_MINUTES * 60_000);
}

/**
 * 지금 로그인을 받아도 되는가. 창 안의 실패 집계만 보고 판단한다.
 *
 * 잠금은 **마지막 실패로부터** 창 길이만큼 유지된다. 창 안의 실패를 다 합쳐 세므로,
 * 그 시각이 지나면 집계가 0 이 되어 반드시 풀린다. 잠긴 동안의 시도를 기록하지 않는 것이
 * 이 보장의 전제다. 기록하면 창이 계속 새로 채워져 영구 잠금이 된다.
 *
 * 전체 한도를 IP 한도보다 먼저 보지 않는다. 같은 IP 가 한도를 넘겼다면
 * 그 IP 에게 알려줄 사실은 "네가 너무 많이 시도했다"는 쪽이 정확하다.
 */
export function evaluateLoginLock(
  ip: FailureWindow,
  global: FailureWindow,
  now: Date,
): LoginLock {
  const breached: { scope: "IP" | "GLOBAL"; window: FailureWindow }[] = [];
  if (ip.count >= IP_FAILURE_LIMIT) breached.push({ scope: "IP", window: ip });
  if (global.count >= GLOBAL_FAILURE_LIMIT) {
    breached.push({ scope: "GLOBAL", window: global });
  }

  for (const { scope, window } of breached) {
    const until = lockedUntil(window);
    if (until === null || until <= now) continue;

    return {
      locked: true,
      scope,
      // 1초 미만이 0 으로 내려가면 "지금 가능"처럼 보인다. 최소 1초로 올린다.
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((until.getTime() - now.getTime()) / 1000),
      ),
    };
  }

  return { locked: false };
}

/** 잠긴 사람에게 보여 줄 문구. 남은 시도 횟수는 알려주지 않는다. (ADR-0020) */
export function lockMessage(lock: Extract<LoginLock, { locked: true }>): string {
  const minutes = Math.ceil(lock.retryAfterSeconds / 60);
  return `로그인 시도가 너무 많습니다. ${minutes}분 후에 다시 시도해 주세요.`;
}
