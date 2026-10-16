import { type FailureWindow, remainingLockSeconds } from "@/lib/attempt-window";

/**
 * 고객 플랜 조회 시도 제한. (ADR-0045 §6)
 *
 * 이름과 휴대전화번호를 둘 다 맞혀야 열리는 공개 경로다. 열거를 횟수로 늦춘다.
 * 판정은 이 파일의 순수 함수 하나에만 있고 화면·Route 가 조건문을 적지 않는다.
 *
 * **전체 한도를 두지 않는 것이 관리자 로그인(ADR-0020)과 다른 점이다.** 로그인이
 * 전체로 잠기면 못 들어오는 사람이 한 명이지만, 조회가 전체로 잠기면 그 시간 동안
 * 모든 고객이 자기 플랜을 못 찾는다. 분산 시도를 막으려고 정상 고객 전부를 막는 쪽이
 * 피해가 크다. 그 자리는 두 칸 모두 일치 요구·최소 노출·감사 로그가 메운다.
 */

/** 실패를 세는 구간. 잠금이 풀리는 시간도 이 길이다. */
export const LOOKUP_WINDOW_MINUTES = 10;

/** 같은 IP 에 허용하는 실패 횟수. 오타를 몇 번 받아줄 만큼은 넉넉하다. */
export const LOOKUP_IP_FAILURE_LIMIT = 10;

export type LookupLock =
  { locked: false } | { locked: true; retryAfterSeconds: number };

/**
 * 지금 조회를 받아도 되는가. 같은 IP 의 **실패** 집계만 본다.
 * 성공은 세지 않는다. 자기 플랜을 여러 번 확인하는 것은 막을 일이 아니다.
 */
export function evaluateLookupLock(ip: FailureWindow, now: Date): LookupLock {
  if (ip.count < LOOKUP_IP_FAILURE_LIMIT) return { locked: false };

  const seconds = remainingLockSeconds(ip, LOOKUP_WINDOW_MINUTES, now);
  if (seconds === null) return { locked: false };

  return { locked: true, retryAfterSeconds: seconds };
}

/** 잠긴 사람에게 보여 줄 문구. 남은 시도 횟수는 알려주지 않는다. (ADR-0020 과 같은 선) */
export function lookupLockMessage(
  lock: Extract<LookupLock, { locked: true }>,
): string {
  const minutes = Math.ceil(lock.retryAfterSeconds / 60);
  return `조회 시도가 너무 많습니다. ${minutes}분 후에 다시 시도해 주세요.`;
}
