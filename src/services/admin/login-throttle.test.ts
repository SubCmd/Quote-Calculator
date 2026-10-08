import { describe, expect, it } from "vitest";
import {
  GLOBAL_FAILURE_LIMIT,
  IP_FAILURE_LIMIT,
  LOGIN_WINDOW_MINUTES,
  type FailureWindow,
  evaluateLoginLock,
  lockMessage,
} from "./login-throttle";

const NOW = new Date("2026-10-08T12:00:00+09:00");

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

const none: FailureWindow = { count: 0, newestAt: null };

function window(count: number, newestMinutesAgo: number): FailureWindow {
  return { count, newestAt: minutesAgo(newestMinutesAgo) };
}

describe("evaluateLoginLock", () => {
  it("실패가 없으면 잠기지 않는다", () => {
    expect(evaluateLoginLock(none, none, NOW)).toEqual({ locked: false });
  });

  it("IP 한도 직전까지는 잠기지 않는다", () => {
    const ip = window(IP_FAILURE_LIMIT - 1, 0);
    expect(evaluateLoginLock(ip, ip, NOW)).toEqual({ locked: false });
  });

  it("IP 한도에 닿으면 잠긴다", () => {
    const ip = window(IP_FAILURE_LIMIT, 0);
    expect(evaluateLoginLock(ip, ip, NOW)).toEqual({
      locked: true,
      scope: "IP",
      retryAfterSeconds: LOGIN_WINDOW_MINUTES * 60,
    });
  });

  it("마지막 실패로부터 창 길이가 지나면 풀린다", () => {
    const ip = window(IP_FAILURE_LIMIT, LOGIN_WINDOW_MINUTES);
    expect(evaluateLoginLock(ip, ip, NOW)).toEqual({ locked: false });
  });

  it("잠금이 남은 시간은 마지막 실패 기준으로 줄어든다", () => {
    const ip = window(IP_FAILURE_LIMIT, 4);
    expect(evaluateLoginLock(ip, ip, NOW)).toEqual({
      locked: true,
      scope: "IP",
      retryAfterSeconds: 360,
    });
  });

  it("IP 는 한도 밑인데 전체가 한도에 닿으면 전체로 잠긴다", () => {
    const ip = window(1, 0);
    const global = window(GLOBAL_FAILURE_LIMIT, 0);
    expect(evaluateLoginLock(ip, global, NOW)).toEqual({
      locked: true,
      scope: "GLOBAL",
      retryAfterSeconds: LOGIN_WINDOW_MINUTES * 60,
    });
  });

  it("전체 한도 직전이면 잠기지 않는다", () => {
    const global = window(GLOBAL_FAILURE_LIMIT - 1, 0);
    expect(evaluateLoginLock(window(1, 0), global, NOW)).toEqual({
      locked: false,
    });
  });

  it("IP 와 전체가 함께 넘치면 IP 를 사유로 돌려준다", () => {
    const ip = window(IP_FAILURE_LIMIT, 0);
    const global = window(GLOBAL_FAILURE_LIMIT, 0);
    expect(evaluateLoginLock(ip, global, NOW)).toEqual({
      locked: true,
      scope: "IP",
      retryAfterSeconds: LOGIN_WINDOW_MINUTES * 60,
    });
  });

  it("IP 잠금이 풀렸어도 전체가 살아 있으면 잠긴 상태다", () => {
    const ip = window(IP_FAILURE_LIMIT, LOGIN_WINDOW_MINUTES);
    const global = window(GLOBAL_FAILURE_LIMIT, 2);
    expect(evaluateLoginLock(ip, global, NOW)).toEqual({
      locked: true,
      scope: "GLOBAL",
      retryAfterSeconds: 480,
    });
  });

  it("한도를 넘겨 쌓였어도 마지막 실패가 창을 벗어나면 풀린다", () => {
    const ip = window(IP_FAILURE_LIMIT + 50, LOGIN_WINDOW_MINUTES + 1);
    expect(evaluateLoginLock(ip, ip, NOW)).toEqual({ locked: false });
  });

  it("남은 시간이 1초 미만이면 1초로 올린다", () => {
    const newestAt = new Date(
      NOW.getTime() - LOGIN_WINDOW_MINUTES * 60_000 + 400,
    );
    const ip: FailureWindow = { count: IP_FAILURE_LIMIT, newestAt };
    expect(evaluateLoginLock(ip, ip, NOW)).toEqual({
      locked: true,
      scope: "IP",
      retryAfterSeconds: 1,
    });
  });
});

describe("lockMessage", () => {
  it("남은 시간을 분으로 올려 알려주고 남은 시도 횟수는 말하지 않는다", () => {
    const message = lockMessage({
      locked: true,
      scope: "IP",
      retryAfterSeconds: 301,
    });
    expect(message).toBe("로그인 시도가 너무 많습니다. 6분 후에 다시 시도해 주세요.");
  });

  it("1초가 남아도 1분으로 안내한다", () => {
    const message = lockMessage({
      locked: true,
      scope: "GLOBAL",
      retryAfterSeconds: 1,
    });
    expect(message).toBe("로그인 시도가 너무 많습니다. 1분 후에 다시 시도해 주세요.");
  });
});
