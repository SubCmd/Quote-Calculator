import { describe, expect, it } from "vitest";
import type { FailureWindow } from "@/lib/attempt-window";
import {
  LOOKUP_IP_FAILURE_LIMIT,
  LOOKUP_WINDOW_MINUTES,
  evaluateLookupLock,
  lookupLockMessage,
} from "./lookup-throttle";

const NOW = new Date("2026-10-16T12:00:00+09:00");

function window(count: number, newestMinutesAgo: number): FailureWindow {
  return {
    count,
    newestAt: new Date(NOW.getTime() - newestMinutesAgo * 60_000),
  };
}

describe("evaluateLookupLock", () => {
  it("실패가 없으면 잠기지 않는다", () => {
    expect(evaluateLookupLock({ count: 0, newestAt: null }, NOW)).toEqual({
      locked: false,
    });
  });

  it("한도 직전까지는 잠기지 않는다", () => {
    expect(
      evaluateLookupLock(window(LOOKUP_IP_FAILURE_LIMIT - 1, 0), NOW),
    ).toEqual({ locked: false });
  });

  it("한도에 닿으면 잠긴다", () => {
    expect(evaluateLookupLock(window(LOOKUP_IP_FAILURE_LIMIT, 0), NOW)).toEqual(
      { locked: true, retryAfterSeconds: LOOKUP_WINDOW_MINUTES * 60 },
    );
  });

  it("마지막 실패로부터 창 길이가 지나면 풀린다", () => {
    expect(
      evaluateLookupLock(
        window(LOOKUP_IP_FAILURE_LIMIT, LOOKUP_WINDOW_MINUTES),
        NOW,
      ),
    ).toEqual({ locked: false });
  });

  it("한도를 훨씬 넘겨 쌓였어도 마지막 실패가 창을 벗어나면 풀린다", () => {
    expect(
      evaluateLookupLock(
        window(LOOKUP_IP_FAILURE_LIMIT + 90, LOOKUP_WINDOW_MINUTES + 1),
        NOW,
      ),
    ).toEqual({ locked: false });
  });

  it("남은 시간은 마지막 실패 기준으로 줄어든다", () => {
    expect(evaluateLookupLock(window(LOOKUP_IP_FAILURE_LIMIT, 4), NOW)).toEqual(
      { locked: true, retryAfterSeconds: 360 },
    );
  });

  it("남은 시간이 1초 미만이면 1초로 올린다", () => {
    const newestAt = new Date(
      NOW.getTime() - LOOKUP_WINDOW_MINUTES * 60_000 + 400,
    );
    expect(
      evaluateLookupLock({ count: LOOKUP_IP_FAILURE_LIMIT, newestAt }, NOW),
    ).toEqual({ locked: true, retryAfterSeconds: 1 });
  });

  it("관리자 로그인보다 한도가 넉넉하다", () => {
    expect(LOOKUP_IP_FAILURE_LIMIT).toBe(10);
  });
});

describe("lookupLockMessage", () => {
  it("남은 시간을 분으로 올려 알려주고 남은 시도 횟수는 말하지 않는다", () => {
    expect(lookupLockMessage({ locked: true, retryAfterSeconds: 301 })).toBe(
      "조회 시도가 너무 많습니다. 6분 후에 다시 시도해 주세요.",
    );
  });

  it("1초가 남아도 1분으로 안내한다", () => {
    expect(lookupLockMessage({ locked: true, retryAfterSeconds: 1 })).toBe(
      "조회 시도가 너무 많습니다. 1분 후에 다시 시도해 주세요.",
    );
  });
});
