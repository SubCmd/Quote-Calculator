import { describe, expect, it } from "vitest";
import { parseSearchRange } from "./search-range";

describe("parseSearchRange", () => {
  it("시작일은 한국 시각 자정으로 해석한다", () => {
    const { from } = parseSearchRange("2026-10-01", undefined);
    expect(from?.toISOString()).toBe("2026-09-30T15:00:00.000Z");
  });

  it("종료일은 당일을 포함하도록 다음 날 자정 미만으로 잡는다", () => {
    const { until } = parseSearchRange(undefined, "2026-10-01");
    expect(until?.toISOString()).toBe("2026-10-01T15:00:00.000Z");
  });

  it("같은 날을 시작·종료로 넣으면 그날 하루가 범위가 된다", () => {
    const { from, until } = parseSearchRange("2026-10-07", "2026-10-07");
    expect(from?.toISOString()).toBe("2026-10-06T15:00:00.000Z");
    expect(until?.toISOString()).toBe("2026-10-07T15:00:00.000Z");
  });

  it("값이 없으면 조건 없음이다", () => {
    expect(parseSearchRange(undefined, undefined)).toEqual({
      from: null,
      until: null,
    });
  });

  it("형식이 맞지 않는 값은 조건 없음으로 떨어뜨린다", () => {
    expect(parseSearchRange("2026-13-99", "어제")).toEqual({
      from: null,
      until: null,
    });
  });

  it("월 경계를 넘는 종료일도 다음 날로 넘어간다", () => {
    const { until } = parseSearchRange(undefined, "2026-10-31");
    expect(until?.toISOString()).toBe("2026-10-31T15:00:00.000Z");
  });
});
