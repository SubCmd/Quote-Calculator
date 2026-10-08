import { describe, expect, it } from "vitest";
import {
  optionKey,
  planDiscountRevival,
  type RevivalCandidate,
} from "./option-revival";

const NAESIN = optionKey("ANALYSIS", "NAESIN");
const MOCK = optionKey("ANALYSIS", "MOCK");
const RECORD = optionKey("ANALYSIS", "RECORD");

function candidate(
  code: string,
  conditions: [string, string][],
): RevivalCandidate {
  return {
    code,
    name: `${code} 할인`,
    conditions: conditions.map(([groupCode, optionCode]) => ({
      groupCode,
      optionCode,
    })),
  };
}

describe("planDiscountRevival", () => {
  it("조건 옵션이 되살리는 옵션 하나뿐이면 할인을 함께 켠다", () => {
    const plan = planDiscountRevival(
      [candidate("SOLO", [["ANALYSIS", "NAESIN"]])],
      new Set(),
      NAESIN,
    );

    expect(plan.revivable).toEqual([{ code: "SOLO", name: "SOLO 할인" }]);
    expect(plan.blocked).toEqual([]);
  });

  it("나머지 조건 옵션이 전부 활성이면 할인을 함께 켠다", () => {
    const plan = planDiscountRevival(
      [
        candidate("BUNDLE_ALL", [
          ["ANALYSIS", "NAESIN"],
          ["ANALYSIS", "MOCK"],
          ["ANALYSIS", "RECORD"],
        ]),
      ],
      new Set([MOCK, RECORD]),
      NAESIN,
    );

    expect(plan.revivable).toEqual([
      { code: "BUNDLE_ALL", name: "BUNDLE_ALL 할인" },
    ]);
    expect(plan.blocked).toEqual([]);
  });

  it("조건 옵션 중 아직 꺼진 것이 남으면 할인을 켜지 않고 사유를 돌려준다", () => {
    const plan = planDiscountRevival(
      [
        candidate("BUNDLE_ALL", [
          ["ANALYSIS", "NAESIN"],
          ["ANALYSIS", "MOCK"],
          ["ANALYSIS", "RECORD"],
        ]),
      ],
      new Set([MOCK]),
      NAESIN,
    );

    expect(plan.revivable).toEqual([]);
    expect(plan.blocked).toEqual([
      { code: "BUNDLE_ALL", name: "BUNDLE_ALL 할인", missing: [RECORD] },
    ]);
  });

  it("되살리는 옵션 자신은 아직 비활성 집합에 없어도 충족으로 본다", () => {
    const plan = planDiscountRevival(
      [candidate("SOLO", [["ANALYSIS", "NAESIN"]])],
      new Set([MOCK]),
      NAESIN,
    );

    expect(plan.revivable).toHaveLength(1);
  });

  it("조건이 한 행도 없는 할인은 항상 되살린다", () => {
    const plan = planDiscountRevival([candidate("ALWAYS", [])], new Set(), NAESIN);

    expect(plan.revivable).toEqual([{ code: "ALWAYS", name: "ALWAYS 할인" }]);
  });

  it("같은 코드의 버전이 여러 개 와도 할인 한 건으로 센다", () => {
    const plan = planDiscountRevival(
      [
        candidate("BUNDLE_ALL", [["ANALYSIS", "NAESIN"]]),
        candidate("BUNDLE_ALL", [["ANALYSIS", "NAESIN"]]),
      ],
      new Set(),
      NAESIN,
    );

    expect(plan.revivable).toHaveLength(1);
    expect(plan.blocked).toHaveLength(0);
  });

  it("되살릴 것과 막힌 것이 섞여 있으면 둘 다 돌려준다", () => {
    const plan = planDiscountRevival(
      [
        candidate("SOLO", [["ANALYSIS", "NAESIN"]]),
        candidate("BUNDLE_ALL", [
          ["ANALYSIS", "NAESIN"],
          ["ANALYSIS", "RECORD"],
        ]),
      ],
      new Set(),
      NAESIN,
    );

    expect(plan.revivable).toEqual([{ code: "SOLO", name: "SOLO 할인" }]);
    expect(plan.blocked).toEqual([
      { code: "BUNDLE_ALL", name: "BUNDLE_ALL 할인", missing: [RECORD] },
    ]);
  });

  it("후보가 없으면 되살릴 할인도 막힌 할인도 없다", () => {
    const plan = planDiscountRevival([], new Set([MOCK]), NAESIN);

    expect(plan).toEqual({ revivable: [], blocked: [] });
  });

  it("같은 옵션이 조건에 중복으로 적혀 있어도 사유를 한 번만 적는다", () => {
    const plan = planDiscountRevival(
      [
        candidate("DUP", [
          ["ANALYSIS", "RECORD"],
          ["ANALYSIS", "RECORD"],
        ]),
      ],
      new Set(),
      NAESIN,
    );

    expect(plan.blocked).toEqual([
      { code: "DUP", name: "DUP 할인", missing: [RECORD] },
    ]);
  });
});
