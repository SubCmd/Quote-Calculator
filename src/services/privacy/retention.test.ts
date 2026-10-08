import { describe, expect, it } from "vitest";
import {
  CONFIRMED_RETENTION_YEARS,
  UNCONFIRMED_RETENTION_YEARS,
  purgeCutoff,
} from "./retention";

const iso = (d: Date) => d.toISOString();

describe("purgeCutoff", () => {
  it("미확정 경계는 1년 전이다", () => {
    const cutoff = purgeCutoff(new Date("2026-10-08T03:00:00.000Z"));
    expect(iso(cutoff.unconfirmedBefore)).toBe("2025-10-08T03:00:00.000Z");
  });

  it("확정 경계는 5년 전이다", () => {
    const cutoff = purgeCutoff(new Date("2026-10-08T03:00:00.000Z"));
    expect(iso(cutoff.confirmedBefore)).toBe("2021-10-08T03:00:00.000Z");
  });

  it("감사 로그 검색어 경계는 미확정과 같은 1년이다", () => {
    const cutoff = purgeCutoff(new Date("2026-10-08T03:00:00.000Z"));
    expect(iso(cutoff.searchLogBefore)).toBe(iso(cutoff.unconfirmedBefore));
  });

  it("시·분·초를 버리지 않는다", () => {
    const cutoff = purgeCutoff(new Date("2026-03-02T14:37:21.456Z"));
    expect(iso(cutoff.unconfirmedBefore)).toBe("2025-03-02T14:37:21.456Z");
  });

  it("윤년 2월 29일에서 1년을 빼면 3월 1일이 된다 (덜 지우지 않는 쪽)", () => {
    const cutoff = purgeCutoff(new Date("2028-02-29T00:00:00.000Z"));
    expect(iso(cutoff.unconfirmedBefore)).toBe("2027-03-01T00:00:00.000Z");
  });

  it("윤년으로 끝나는 5년 전 경계도 실재하는 날짜가 된다", () => {
    const cutoff = purgeCutoff(new Date("2029-02-28T00:00:00.000Z"));
    expect(iso(cutoff.confirmedBefore)).toBe("2024-02-28T00:00:00.000Z");
  });

  it("서버 타임존과 무관하게 UTC 로 계산한다", () => {
    const cutoff = purgeCutoff(new Date("2026-01-01T00:00:00.000Z"));
    expect(iso(cutoff.unconfirmedBefore)).toBe("2025-01-01T00:00:00.000Z");
  });

  it("보존기간 상수는 고지 문구와 같은 1년 · 5년이다", () => {
    expect(UNCONFIRMED_RETENTION_YEARS).toBe(1);
    expect(CONFIRMED_RETENTION_YEARS).toBe(5);
  });
});
