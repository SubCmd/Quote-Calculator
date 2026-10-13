import { describe, expect, it } from "vitest";
import { planReorder } from "./display-order";

const CURRENT = ["NAESIN", "MOCK", "RECORD", "V1"];

function orderOf(current: string[], next: string[]): [string, number][] {
  return [...planReorder(current, next).sortOrderByKey];
}

describe("planReorder", () => {
  it("받은 순서대로 1부터 빈틈없이 sortOrder 를 매긴다", () => {
    expect(orderOf(CURRENT, ["V1", "NAESIN", "RECORD", "MOCK"])).toEqual([
      ["V1", 1],
      ["NAESIN", 2],
      ["RECORD", 3],
      ["MOCK", 4],
    ]);
  });

  it("순서가 그대로면 changed 가 false 다", () => {
    expect(planReorder(CURRENT, [...CURRENT]).changed).toBe(false);
  });

  it("두 항목만 자리를 바꿔도 changed 가 true 다", () => {
    expect(planReorder(CURRENT, ["MOCK", "NAESIN", "RECORD", "V1"]).changed).toBe(
      true,
    );
  });

  it("항목이 하나뿐이어도 동작한다", () => {
    expect(orderOf(["ONLY"], ["ONLY"])).toEqual([["ONLY", 1]]);
  });

  // 부분 목록을 받아 나머지를 뒤에 붙이지 않는다. 보내지 않은 항목의 자리를 추측하는 셈이 된다.
  it("빠진 항목이 있으면 거부한다", () => {
    expect(() => planReorder(CURRENT, ["NAESIN", "MOCK", "RECORD"])).toThrow(
      "빠진 항목",
    );
  });

  it("같은 항목이 두 번 들어오면 거부한다", () => {
    expect(() =>
      planReorder(CURRENT, ["NAESIN", "NAESIN", "MOCK", "RECORD"]),
    ).toThrow("두 번");
  });

  it("그 묶음에 없는 항목이 들어오면 거부한다", () => {
    expect(() =>
      planReorder(CURRENT, ["NAESIN", "MOCK", "RECORD", "STAGE_1"]),
    ).toThrow("순서를 바꿀 수 없는 항목");
  });

  // 중복이 들어오면 개수가 맞아도 누락이 함께 생긴다. 중복을 먼저 알려주는 쪽이 고치기 쉽다.
  it("개수는 같지만 중복이면 중복을 사유로 돌려준다", () => {
    expect(() =>
      planReorder(CURRENT, ["NAESIN", "NAESIN", "MOCK", "RECORD"]),
    ).toThrow("두 번");
  });

  it("빈 목록은 거부한다", () => {
    expect(() => planReorder(CURRENT, [])).toThrow("빠진 항목");
  });
});
