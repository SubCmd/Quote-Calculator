/**
 * 시도 제한의 시간 계산. 관리자 로그인(ADR-0020)과 고객 플랜 조회(ADR-0045)가 같이 쓴다.
 *
 * 한도·창 길이·무엇을 잠그는지는 서로 다르지만 **마지막 실패로부터 창 길이만큼 잠근다**
 * 는 식은 같다. 같은 식을 두 번 적으면 한쪽만 고쳐질 수 있고, 그때 두 경로의
 * 잠금 시간이 조용히 어긋난다.
 */

/** 창 안의 실패 집계. `newestAt` 은 잠금이 풀리는 시각을 구하는 데 쓴다. */
export interface FailureWindow {
  count: number;
  newestAt: Date | null;
}

/**
 * 창이 끝나 잠금이 풀리는 시각. 실패가 없으면 `null` 이다.
 *
 * 잠금은 마지막 실패를 기준으로 한다. 창 안의 실패를 다 합쳐 세므로 이 시각이 지나면
 * 집계가 0 이 되어 반드시 풀린다. **잠긴 동안의 시도를 기록하지 않는 것이 이 보장의
 * 전제다.** 기록하면 창이 계속 새로 채워져 영구 잠금이 된다.
 */
export function lockedUntil(
  window: FailureWindow,
  windowMinutes: number,
): Date | null {
  if (window.newestAt === null) return null;
  return new Date(window.newestAt.getTime() + windowMinutes * 60_000);
}

/**
 * 아직 잠겨 있다면 남은 초, 풀렸으면 `null`.
 * 부르는 쪽이 `null` 비교를 두 번 적지 않도록 판정과 남은 시간을 함께 돌려준다.
 */
export function remainingLockSeconds(
  window: FailureWindow,
  windowMinutes: number,
  now: Date,
): number | null {
  const until = lockedUntil(window, windowMinutes);
  if (until === null || until <= now) return null;

  // 1초 미만이 0 으로 내려가면 "지금 가능"처럼 보인다. 최소 1초로 올린다.
  return Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000));
}

/** 창 집계를 조회할 시작 시각. 이 앞의 행은 판정에 쓰이지 않는다. */
export function windowStart(now: Date, windowMinutes: number): Date {
  return new Date(now.getTime() - windowMinutes * 60_000);
}
