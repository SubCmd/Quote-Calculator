import { describe, expect, it } from "vitest";
import { QUOTE_VALIDITY_DAYS, displayStatus, expiresAtFrom } from "./expiry";

const CALCULATED_AT = new Date("2026-03-01T00:00:00.000Z");
const EXPIRES_AT = new Date("2026-03-31T00:00:00.000Z");

describe("expiresAtFrom (ADR-0012)", () => {
  it("계산 시점으로부터 30일 뒤가 유효기간이다", () => {
    expect(QUOTE_VALIDITY_DAYS).toBe(30);
    expect(expiresAtFrom(CALCULATED_AT).toISOString()).toBe(
      "2026-03-31T00:00:00.000Z",
    );
  });
});

describe("displayStatus (ADR-0012)", () => {
  it("유효기간 안이면 저장된 상태를 그대로 쓴다", () => {
    const now = new Date("2026-03-30T23:59:59.000Z");
    expect(displayStatus("REQUESTED", EXPIRES_AT, now)).toBe("REQUESTED");
  });

  it("유효기간이 지나면 REQUESTED 는 EXPIRED 로 보인다", () => {
    const now = new Date("2026-03-31T00:00:01.000Z");
    expect(displayStatus("REQUESTED", EXPIRES_AT, now)).toBe("EXPIRED");
  });

  it("유효기간 경계 시각은 이미 만료다", () => {
    expect(displayStatus("DRAFT", EXPIRES_AT, EXPIRES_AT)).toBe("EXPIRED");
  });

  it("확정된 견적은 유효기간이 지나도 만료되지 않는다", () => {
    const now = new Date("2027-01-01T00:00:00.000Z");
    expect(displayStatus("CONFIRMED", EXPIRES_AT, now)).toBe("CONFIRMED");
  });

  it("취소된 견적은 유효기간이 지나도 취소 상태로 남는다", () => {
    const now = new Date("2027-01-01T00:00:00.000Z");
    expect(displayStatus("CANCELED", EXPIRES_AT, now)).toBe("CANCELED");
  });
});
