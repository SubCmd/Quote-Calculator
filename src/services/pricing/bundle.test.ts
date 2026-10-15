import { describe, expect, it } from "vitest";
import { findBundleSuggestions } from "./bundle";
import { priceSelection } from "./price-selection";
import type { RuleSet } from "./types";

/**
 * 묶음 안내 단위 테스트. (ADR-0037, docs/pricing-rules.md 10절)
 * 금액은 prisma/seed.ts 의 1회성 컨설팅과 같다.
 */
const oneshot: RuleSet = {
  product: { id: "prod-oneshot", name: "1회성 컨설팅" },
  groups: [
    {
      id: "grp-analysis",
      name: "분석 항목",
      required: false,
      singleSelect: false,
      dependsOnGroupId: null,
    },
  ],
  options: [
    {
      id: "opt-naesin",
      groupId: "grp-analysis",
      name: "내신 성적 분석 (30분)",
      amount: 59_000,
      versionId: "v-naesin",
    },
    {
      id: "opt-mock",
      groupId: "grp-analysis",
      name: "모의고사 성적 분석 (30분)",
      amount: 59_000,
      versionId: "v-mock",
    },
    {
      id: "opt-record",
      groupId: "grp-analysis",
      name: "생활기록부 분석 (1시간)",
      amount: 149_000,
      versionId: "v-record",
    },
    {
      id: "opt-v1",
      groupId: "grp-analysis",
      name: "내신 + 생활기록부 분석 (60~70분)",
      amount: 199_000,
      versionId: "v-v1",
    },
  ],
  discounts: [],
  bundles: [
    { optionId: "opt-v1", componentOptionIds: ["opt-naesin", "opt-record"] },
  ],
};

/** 안내 호출부와 같은 식으로 총액을 낸다. 테스트가 기대값을 계산하는 것이 아니다. */
function suggest(ruleSet: RuleSet, optionIds: string[]) {
  const total = priceSelection(ruleSet, optionIds).totalAmount;
  return findBundleSuggestions(ruleSet, optionIds, total);
}

function withBundleAmount(amount: number): RuleSet {
  return {
    ...oneshot,
    options: oneshot.options.map((o) =>
      o.id === "opt-v1" ? { ...o, amount } : o,
    ),
  };
}

describe("findBundleSuggestions - 안내 조건", () => {
  it("구성 옵션을 전부 고르면 묶음을 안내한다", () => {
    expect(suggest(oneshot, ["opt-naesin", "opt-record"])).toEqual([
      {
        optionId: "opt-v1",
        name: "내신 + 생활기록부 분석 (60~70분)",
        nextOptionIds: ["opt-v1"],
        savingAmount: 9000,
      },
    ]);
  });

  it("구성 옵션 중 하나라도 빠지면 안내하지 않는다", () => {
    expect(suggest(oneshot, ["opt-naesin"])).toEqual([]);
    expect(suggest(oneshot, ["opt-record"])).toEqual([]);
    expect(suggest(oneshot, [])).toEqual([]);
  });

  it("이미 묶음을 고르고 있으면 안내하지 않는다", () => {
    expect(suggest(oneshot, ["opt-v1", "opt-naesin", "opt-record"])).toEqual(
      [],
    );
  });

  it("구성 옵션 밖의 선택은 바뀐 선택에 그대로 남는다", () => {
    const [suggestion] = suggest(oneshot, [
      "opt-mock",
      "opt-naesin",
      "opt-record",
    ]);

    expect(suggestion?.nextOptionIds).toEqual(["opt-mock", "opt-v1"]);
    expect(suggestion?.savingAmount).toBe(9000);
  });

  it("구성 목록이 빈 묶음은 안내하지 않는다", () => {
    const ruleSet: RuleSet = {
      ...oneshot,
      bundles: [{ optionId: "opt-v1", componentOptionIds: [] }],
    };

    expect(suggest(ruleSet, ["opt-naesin", "opt-record"])).toEqual([]);
    expect(suggest(ruleSet, [])).toEqual([]);
  });

  it("묶음이 더 비싸면 안내하지 않는다", () => {
    const ruleSet = withBundleAmount(215_000);

    expect(suggest(ruleSet, ["opt-naesin", "opt-record"])).toEqual([]);
  });

  it("묶음이 같은 금액이어도 안내하지 않는다", () => {
    const ruleSet = withBundleAmount(208_000);

    expect(suggest(ruleSet, ["opt-naesin", "opt-record"])).toEqual([]);
  });
});

describe("findBundleSuggestions - 절약액", () => {
  // 안내한 숫자와 실제 결과가 어긋나면 화면에 적힌 문구가 거짓이 된다. (ADR-0037)
  it("절약액은 안내한 선택으로 다시 계산한 총액의 차이와 같다", () => {
    const current = priceSelection(oneshot, ["opt-naesin", "opt-record"]);
    const [suggestion] = findBundleSuggestions(
      oneshot,
      ["opt-naesin", "opt-record"],
      current.totalAmount,
    );
    const next = priceSelection(oneshot, suggestion!.nextOptionIds);

    expect(current.totalAmount).toBe(208_000);
    expect(next.totalAmount).toBe(199_000);
    expect(suggestion?.savingAmount).toBe(9000);
  });

  // 구성 옵션 금액의 차(9,000)로 계산하면 할인 변화를 놓친다. (ADR-0037)
  it("묶음으로 바꾸면서 할인이 사라지면 그만큼 절약액이 줄어든다", () => {
    const ruleSet: RuleSet = {
      ...oneshot,
      discounts: [
        {
          id: "disc-pair",
          name: "두 항목 할인",
          type: "FIXED",
          amount: 5000,
          rateBp: 0,
          requiredOptionIds: ["opt-naesin", "opt-record"],
          priority: 10,
          versionId: "v-pair",
        },
      ],
    };

    expect(
      priceSelection(ruleSet, ["opt-naesin", "opt-record"]).totalAmount,
    ).toBe(203_000);
    expect(suggest(ruleSet, ["opt-naesin", "opt-record"])).toEqual([
      {
        optionId: "opt-v1",
        name: "내신 + 생활기록부 분석 (60~70분)",
        nextOptionIds: ["opt-v1"],
        savingAmount: 4000,
      },
    ]);
  });

  it("할인이 커서 묶음이 더 비싸지면 안내하지 않는다", () => {
    const ruleSet: RuleSet = {
      ...oneshot,
      discounts: [
        {
          id: "disc-pair",
          name: "두 항목 할인",
          type: "FIXED",
          amount: 20_000,
          rateBp: 0,
          requiredOptionIds: ["opt-naesin", "opt-record"],
          priority: 10,
          versionId: "v-pair",
        },
      ],
    };

    expect(suggest(ruleSet, ["opt-naesin", "opt-record"])).toEqual([]);
  });

  // 10원 단위 버림(ADR-0007) 때문에 구성 금액의 차와 총액의 차가 다를 수 있다.
  it("절약액은 버림 이후 금액으로 낸다", () => {
    const ruleSet: RuleSet = {
      ...oneshot,
      options: oneshot.options.map((o) => {
        if (o.id === "opt-naesin") return { ...o, amount: 59_004 };
        if (o.id === "opt-v1") return { ...o, amount: 199_009 };
        return o;
      }),
      bundles: oneshot.bundles,
    };

    // 208,004 → 208,000 / 199,009 → 199,000
    expect(
      priceSelection(ruleSet, ["opt-naesin", "opt-record"]).totalAmount,
    ).toBe(208_000);
    expect(
      suggest(ruleSet, ["opt-naesin", "opt-record"])[0]?.savingAmount,
    ).toBe(9000);
  });
});

describe("findBundleSuggestions - 선택 제약 (ADR-0010)", () => {
  it("바꾼 선택이 단일 선택 그룹을 위반하면 안내하지 않는다", () => {
    const ruleSet: RuleSet = {
      ...oneshot,
      groups: [{ ...oneshot.groups[0]!, singleSelect: true }],
    };

    // 구성 옵션 둘을 고른 현재 선택부터 위반이지만, 안내 여부는 바꾼 선택으로 판단한다.
    expect(suggest(ruleSet, ["opt-naesin", "opt-record"])).toEqual([
      {
        optionId: "opt-v1",
        name: "내신 + 생활기록부 분석 (60~70분)",
        nextOptionIds: ["opt-v1"],
        savingAmount: 9000,
      },
    ]);
    // 묶음과 무관한 옵션이 남으면 단일 선택 그룹에 2개가 되어 안내가 사라진다.
    expect(suggest(ruleSet, ["opt-mock", "opt-naesin", "opt-record"])).toEqual(
      [],
    );
  });

  /**
   * 묶음이 다른 그룹에 있으면 바꾸는 순간 원래 그룹이 비는데,
   * 그 그룹을 선행으로 삼는 그룹의 선택이 남아 있으면 위반이다.
   */
  it("구성 옵션을 빼면서 선행 조건이 깨지면 안내하지 않는다", () => {
    const ruleSet: RuleSet = {
      ...oneshot,
      groups: [
        ...oneshot.groups,
        {
          id: "grp-bundle",
          name: "묶음",
          required: false,
          singleSelect: false,
          dependsOnGroupId: null,
        },
        {
          id: "grp-extra",
          name: "추가 항목",
          required: false,
          singleSelect: false,
          dependsOnGroupId: "grp-analysis",
        },
      ],
      options: [
        ...oneshot.options.map((o) =>
          o.id === "opt-v1" ? { ...o, groupId: "grp-bundle" } : o,
        ),
        {
          id: "opt-addon",
          groupId: "grp-extra",
          name: "추가 상담",
          amount: 30_000,
          versionId: "v-addon",
        },
      ],
    };

    // 구성 옵션만 고른 선택은 바꿔도 선행이 깨질 것이 없다.
    expect(suggest(ruleSet, ["opt-naesin", "opt-record"])).toHaveLength(1);
    // 선행 그룹이 비게 되는 선택에는 안내하지 않는다.
    expect(suggest(ruleSet, ["opt-naesin", "opt-record", "opt-addon"])).toEqual(
      [],
    );
  });

  it("묶음 옵션이 이 상품에 없으면 안내하지 않는다", () => {
    const ruleSet: RuleSet = {
      ...oneshot,
      bundles: [
        {
          optionId: "opt-gone",
          componentOptionIds: ["opt-naesin", "opt-record"],
        },
      ],
    };

    expect(suggest(ruleSet, ["opt-naesin", "opt-record"])).toEqual([]);
  });
});

describe("findBundleSuggestions - 순서", () => {
  it("절약액이 큰 묶음을 먼저 안내하고 동률이면 옵션 id 순이다", () => {
    const ruleSet: RuleSet = {
      ...oneshot,
      options: [
        ...oneshot.options,
        {
          id: "opt-v2",
          groupId: "grp-analysis",
          name: "내신 + 모의고사 분석",
          amount: 108_000,
          versionId: "v-v2",
        },
        {
          id: "opt-v3",
          groupId: "grp-analysis",
          name: "모의고사 + 생활기록부 분석",
          amount: 199_000,
          versionId: "v-v3",
        },
      ],
      bundles: [
        { optionId: "opt-v3", componentOptionIds: ["opt-mock", "opt-record"] },
        {
          optionId: "opt-v1",
          componentOptionIds: ["opt-naesin", "opt-record"],
        },
        { optionId: "opt-v2", componentOptionIds: ["opt-naesin", "opt-mock"] },
      ],
    };

    const result = suggest(ruleSet, ["opt-naesin", "opt-mock", "opt-record"]);

    expect(result.map((s) => [s.optionId, s.savingAmount])).toEqual([
      ["opt-v2", 10_000],
      ["opt-v1", 9000],
      ["opt-v3", 9000],
    ]);
  });
});
