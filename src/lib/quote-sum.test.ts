import { describe, expect, it } from "vitest";
import { sumTotals } from "./quote-sum";

/** 기대값은 리터럴로 쓴다. 구현과 같은 식을 쓰면 버그를 같이 복제한다. */
describe("sumTotals", () => {
  it("고른 줄이 없으면 0원이다", () => {
    expect(sumTotals([])).toBe(0);
  });

  it("한 줄이면 그 줄의 총액이다", () => {
    expect(sumTotals([{ totalAmount: 1_069_000 }])).toBe(1_069_000);
  });

  it("고른 줄의 총액을 모두 더한다", () => {
    const rows = [
      { totalAmount: 1_069_000 },
      { totalAmount: 579_000 },
      { totalAmount: 890_000 },
    ];
    expect(sumTotals(rows)).toBe(2_538_000);
  });

  it("총액이 0원인 견적이 섞여 있어도 더한다", () => {
    expect(sumTotals([{ totalAmount: 0 }, { totalAmount: 89_000 }])).toBe(
      89_000,
    );
  });

  it("한 페이지 20건을 더해도 정수로 정확하다", () => {
    const rows = Array.from({ length: 20 }, () => ({
      totalAmount: 1_069_000,
    }));
    expect(sumTotals(rows)).toBe(21_380_000);
  });

  it("10원 단위 금액만 들어오므로 합도 10원 단위다", () => {
    expect(sumTotals([{ totalAmount: 5_060 }, { totalAmount: 94_950 }])).toBe(
      100_010,
    );
  });
});
