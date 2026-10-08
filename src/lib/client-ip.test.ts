import { describe, expect, it } from "vitest";
import { clientIp } from "./client-ip";

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("clientIp", () => {
  it("Cloudflare 가 넣어 준 접속 주소를 쓴다", () => {
    expect(clientIp(headers({ "CF-Connecting-IP": "203.0.113.7" }))).toBe(
      "203.0.113.7",
    );
  });

  it("헤더 이름의 대소문자를 가리지 않는다", () => {
    expect(clientIp(headers({ "cf-connecting-ip": "203.0.113.7" }))).toBe(
      "203.0.113.7",
    );
  });

  it("앞뒤 공백을 떼고 쓴다", () => {
    expect(clientIp(headers({ "CF-Connecting-IP": "  203.0.113.7 " }))).toBe(
      "203.0.113.7",
    );
  });

  it("x-forwarded-for 는 위조될 수 있으므로 쓰지 않는다", () => {
    expect(clientIp(headers({ "X-Forwarded-For": "203.0.113.7" }))).toBe(
      "unknown",
    );
  });

  it("x-real-ip 도 쓰지 않는다", () => {
    expect(clientIp(headers({ "X-Real-IP": "203.0.113.7" }))).toBe("unknown");
  });

  it("위조한 x-forwarded-for 가 Cloudflare 값을 덮지 못한다", () => {
    const value = clientIp(
      headers({
        "X-Forwarded-For": "198.51.100.1",
        "CF-Connecting-IP": "203.0.113.7",
      }),
    );

    expect(value).toBe("203.0.113.7");
  });

  it("헤더가 없으면 unknown 한 칸으로 모은다", () => {
    expect(clientIp(headers({}))).toBe("unknown");
  });

  it("빈 문자열도 unknown 으로 본다", () => {
    expect(clientIp(headers({ "CF-Connecting-IP": "   " }))).toBe("unknown");
  });
});
