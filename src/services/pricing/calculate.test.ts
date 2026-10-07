import { describe, expect, it } from "vitest";
import { calculate } from "./calculate";
import { splitTax } from "./tax";
import type { RuleSet } from "./types";

/**
 * 픽스처 금액은 prisma/seed.ts 와 같다. (docs/pricing-rules.md 9절)
 * 카톡 300,000 / 이메일 100,000 만 확정값이고 나머지는 임시값이다. (requirements.md Q-9)
 * 임시값이 교체되면 이 파일의 기대값도 함께 갱신한다.
 */
const NOW = new Date("2026-10-06T00:00:00.000Z");

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
      name: "내신 성적 분석",
      amount: 150_000,
      versionId: "v-naesin",
    },
    {
      id: "opt-mock",
      groupId: "grp-analysis",
      name: "모의고사 성적 분석",
      amount: 150_000,
      versionId: "v-mock",
    },
    {
      id: "opt-record",
      groupId: "grp-analysis",
      name: "생활기록부 분석",
      amount: 200_000,
      versionId: "v-record",
    },
  ],
  discounts: [
    {
      id: "disc-bundle",
      name: "통합 할인 (분석 3개)",
      type: "RATE",
      amount: 0,
      rateBp: 1500,
      requiredOptionIds: ["opt-naesin", "opt-mock", "opt-record"],
      priority: 10,
      versionId: "v-bundle",
    },
  ],
};

const course: RuleSet = {
  product: { id: "prod-course", name: "과정 컨설팅" },
  groups: [
    {
      id: "grp-sessions",
      name: "회차",
      required: false,
      singleSelect: true,
      dependsOnGroupId: null,
    },
    {
      id: "grp-channel",
      name: "소통 방식",
      required: false,
      singleSelect: true,
      dependsOnGroupId: "grp-sessions",
    },
    {
      id: "grp-assignment",
      name: "수행평가 자료 요청",
      required: false,
      singleSelect: true,
      dependsOnGroupId: "grp-sessions",
    },
  ],
  options: [
    {
      id: "opt-s3",
      groupId: "grp-sessions",
      name: "3회차",
      amount: 600_000,
      versionId: "v-s3",
    },
    {
      id: "opt-s6",
      groupId: "grp-sessions",
      name: "6회차",
      amount: 1_100_000,
      versionId: "v-s6",
    },
    {
      id: "opt-kakao",
      groupId: "grp-channel",
      name: "카톡 소통",
      amount: 300_000,
      versionId: "v-kakao",
    },
    {
      id: "opt-email",
      groupId: "grp-channel",
      name: "이메일 소통",
      amount: 100_000,
      versionId: "v-email",
    },
    {
      id: "opt-a5",
      groupId: "grp-assignment",
      name: "5건",
      amount: 250_000,
      versionId: "v-a5",
    },
    {
      id: "opt-a10",
      groupId: "grp-assignment",
      name: "10건",
      amount: 450_000,
      versionId: "v-a10",
    },
  ],
  discounts: [],
};

const STAGE_IDS = [
  "opt-st1",
  "opt-st2",
  "opt-st3",
  "opt-st4",
  "opt-st5",
  "opt-st6",
];

const allstoryG2: RuleSet = {
  product: { id: "prod-g2", name: "고2 올스토리" },
  groups: [
    {
      id: "grp-stage",
      name: "단계",
      required: false,
      singleSelect: false,
      dependsOnGroupId: null,
    },
  ],
  options: STAGE_IDS.map((id, i) => ({
    id,
    groupId: "grp-stage",
    name: `${i + 1}단계`,
    amount: 200_000,
    versionId: `v-st${i + 1}`,
  })),
  discounts: [
    {
      id: "disc-all-stages",
      name: "전단계 할인",
      type: "RATE",
      amount: 0,
      rateBp: 1000,
      requiredOptionIds: STAGE_IDS,
      priority: 10,
      versionId: "v-all-stages",
    },
  ],
};

/** 필수 그룹과 10원 단위 버림을 검증하기 위한 가상 상품. 실제 상품에는 둘 다 없다. */
const edgeCase: RuleSet = {
  product: { id: "prod-edge", name: "경계값 확인용" },
  groups: [
    {
      id: "grp-req",
      name: "필수 항목",
      required: true,
      singleSelect: true,
      dependsOnGroupId: null,
    },
  ],
  options: [
    {
      id: "opt-odd",
      groupId: "grp-req",
      name: "끝자리 있는 금액",
      amount: 33_773,
      versionId: "v-odd",
    },
  ],
  discounts: [
    {
      id: "disc-any",
      name: "무조건 15% 할인",
      type: "RATE",
      amount: 0,
      rateBp: 1500,
      requiredOptionIds: [],
      priority: 10,
      versionId: "v-any",
    },
  ],
};

function run(ruleSet: RuleSet, optionIds: string[]) {
  return calculate({ productId: ruleSet.product.id, optionIds }, ruleSet, NOW);
}

function ok(ruleSet: RuleSet, optionIds: string[]) {
  const result = run(ruleSet, optionIds);
  if (!result.ok) throw new Error("계산이 거부되었습니다");
  return result;
}

describe("calculate - 1회성 컨설팅 (docs/pricing-rules.md 9-1, 9-2)", () => {
  it("분석 항목 3개를 모두 선택하면 통합 할인이 적용된다", () => {
    const result = ok(oneshot, ["opt-naesin", "opt-mock", "opt-record"]);

    expect(result.items[0]?.optionAmount).toBe(500_000);
    expect(result.subtotal).toBe(500_000);
    expect(result.appliedDiscount?.discountId).toBe("disc-bundle");
    expect(result.discountAmount).toBe(75_000);
    expect(result.totalAmount).toBe(425_000);
  });

  it("분석 항목 2개만 선택하면 할인 후보가 없다", () => {
    const result = ok(oneshot, ["opt-naesin", "opt-mock"]);

    expect(result.subtotal).toBe(300_000);
    expect(result.discountCandidates).toHaveLength(0);
    expect(result.appliedDiscount).toBeNull();
    expect(result.discountAmount).toBe(0);
    expect(result.totalAmount).toBe(300_000);
  });

  it("선택 항목별 금액을 분해해서 반환한다", () => {
    const result = ok(oneshot, ["opt-naesin", "opt-record"]);

    expect(result.items[0]?.appliedOptions).toEqual([
      { optionId: "opt-naesin", name: "내신 성적 분석", amount: 150_000 },
      { optionId: "opt-record", name: "생활기록부 분석", amount: 200_000 },
    ]);
  });

  it("적용된 가격 규칙 버전을 모두 기록한다", () => {
    const result = ok(oneshot, ["opt-naesin", "opt-mock", "opt-record"]);

    expect(result.pricingRuleVersionIds).toEqual([
      "v-naesin",
      "v-mock",
      "v-record",
      "v-bundle",
    ]);
    expect(result.calculatedAt).toBe(NOW);
  });
});

describe("calculate - 과정 컨설팅 (docs/pricing-rules.md 9-3)", () => {
  it("6회차 + 카톡 + 10건 조합의 금액을 합산한다", () => {
    const result = ok(course, ["opt-s6", "opt-kakao", "opt-a10"]);

    expect(result.subtotal).toBe(1_850_000);
    expect(result.appliedDiscount).toBeNull();
    expect(result.totalAmount).toBe(1_850_000);
  });

  it("회차는 수량이 아니다. 6회차가 3회차의 두 배가 아니어도 된다", () => {
    const three = ok(course, ["opt-s3"]);
    const six = ok(course, ["opt-s6"]);

    expect(three.totalAmount).toBe(600_000);
    expect(six.totalAmount).toBe(1_100_000);
  });

  it("소통 방식만 바꾸면 그 차액만큼만 달라진다", () => {
    const kakao = ok(course, ["opt-s3", "opt-kakao"]);
    const email = ok(course, ["opt-s3", "opt-email"]);

    expect(kakao.totalAmount).toBe(900_000);
    expect(email.totalAmount).toBe(700_000);
  });
});

describe("calculate - 올스토리 (docs/pricing-rules.md 9-4)", () => {
  it("전단계를 선택하면 전단계 할인이 적용된다", () => {
    const result = ok(allstoryG2, STAGE_IDS);

    expect(result.subtotal).toBe(1_200_000);
    expect(result.appliedDiscount?.discountId).toBe("disc-all-stages");
    expect(result.discountAmount).toBe(120_000);
    expect(result.totalAmount).toBe(1_080_000);
  });

  it("단계 하나가 빠지면 할인이 걸리지 않는다", () => {
    const result = ok(allstoryG2, STAGE_IDS.slice(0, 5));

    expect(result.subtotal).toBe(1_000_000);
    expect(result.discountCandidates).toHaveLength(0);
    expect(result.totalAmount).toBe(1_000_000);
  });
});

describe("calculate - 선택 없음 (docs/pricing-rules.md 9-5)", () => {
  it("아무것도 선택하지 않으면 위반 없이 총액 0원을 반환한다", () => {
    const result = ok(oneshot, []);

    expect(result.items[0]?.optionAmount).toBe(0);
    expect(result.items[0]?.appliedOptions).toEqual([]);
    expect(result.subtotal).toBe(0);
    expect(result.discountAmount).toBe(0);
    expect(result.totalAmount).toBe(0);
    expect(result.pricingRuleVersionIds).toEqual([]);
  });
});

describe("calculate - 10원 단위 버림 (ADR-0007)", () => {
  it("항목 소계를 10원 단위로 버린다", () => {
    const result = ok(edgeCase, ["opt-odd"]);

    expect(result.items[0]?.optionAmount).toBe(33_773);
    expect(result.items[0]?.subtotal).toBe(33_770);
  });

  it("할인액도 10원 단위로 버린다", () => {
    const result = ok(edgeCase, ["opt-odd"]);

    expect(result.discountCandidates[0]?.amount).toBe(5065);
    expect(result.discountAmount).toBe(5060);
    expect(result.totalAmount).toBe(28_710);
  });

  it.each([
    ["1회성 전체", oneshot, ["opt-naesin", "opt-mock", "opt-record"]],
    ["1회성 1개", oneshot, ["opt-record"]],
    ["과정 전체", course, ["opt-s6", "opt-email", "opt-a5"]],
    ["올스토리 전단계", allstoryG2, STAGE_IDS],
    ["올스토리 1단계", allstoryG2, ["opt-st1"]],
    ["끝자리 있는 금액", edgeCase, ["opt-odd"]],
    ["선택 없음", oneshot, []],
  ])("%s 에서 총액이 10원 단위다", (_label, ruleSet, optionIds) => {
    expect(ok(ruleSet, optionIds).totalAmount % 10).toBe(0);
  });
});

describe("calculate - 선택 제약 (docs/pricing-rules.md 5절)", () => {
  it("단일 선택 그룹에서 2개를 선택하면 금액 대신 위반 사유를 반환한다", () => {
    const result = run(course, ["opt-s3", "opt-kakao", "opt-email"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations[0]?.code).toBe("MULTIPLE_IN_SINGLE_GROUP");
    expect(result.violations[0]?.groupId).toBe("grp-channel");
  });

  it("필수 그룹을 비우면 위반 사유를 반환한다", () => {
    const result = run(edgeCase, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations[0]?.code).toBe("REQUIRED_GROUP_EMPTY");
    expect(result.violations[0]?.groupId).toBe("grp-req");
  });

  it("존재하지 않는 옵션이면 위반 사유를 반환한다", () => {
    const result = run(oneshot, ["opt-nope"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations[0]?.code).toBe("UNKNOWN_OPTION");
  });

  it("계산 거부는 금액 0원이 아니다", () => {
    const rejected = run(course, ["opt-s3", "opt-kakao", "opt-email"]);
    expect(rejected.ok).toBe(false);
    expect(rejected).not.toHaveProperty("totalAmount");

    // 같은 0원이라도 선택이 없을 때는 성공이다. 둘을 구분해야 한다. (ADR-0008)
    const empty = run(oneshot, []);
    expect(empty.ok).toBe(true);
    expect(empty).toHaveProperty("totalAmount", 0);
  });
});

describe("calculate - 선행 그룹 (docs/pricing-rules.md 5-1절, ADR-0010)", () => {
  it("선행 그룹이 비었는데 딸린 그룹을 선택하면 위반 사유를 반환한다", () => {
    const result = run(course, ["opt-kakao"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations[0]?.code).toBe("GROUP_PREREQUISITE_UNMET");
    expect(result.violations[0]?.groupId).toBe("grp-channel");
    expect(result.violations[0]?.optionIds).toEqual(["opt-kakao"]);
  });

  it("선행 그룹을 선택하면 딸린 그룹도 선택할 수 있다", () => {
    const result = ok(course, ["opt-s3", "opt-kakao"]);
    expect(result.totalAmount).toBe(900_000);
  });

  it("선행 그룹과 딸린 그룹이 모두 비면 위반이 아니라 0원이다", () => {
    const result = ok(course, []);
    expect(result.totalAmount).toBe(0);
  });

  it("선행 그룹이 비면 딸린 그룹마다 위반이 쌓인다", () => {
    const result = run(course, ["opt-kakao", "opt-a5"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.map((v) => v.groupId)).toEqual([
      "grp-channel",
      "grp-assignment",
    ]);
  });

  it("선행 그룹 식별자가 규칙에 없으면 예외를 던진다", () => {
    const broken: RuleSet = {
      ...course,
      groups: course.groups.map((g) =>
        g.id === "grp-channel" ? { ...g, dependsOnGroupId: "grp-missing" } : g,
      ),
    };
    expect(() => run(broken, ["opt-s3", "opt-kakao"])).toThrow("선행 그룹");
  });
});

describe("splitTax", () => {
  it("공급가액과 세액의 합은 총액과 정확히 일치한다", () => {
    const { supplyAmount, vatAmount } = splitTax(425_000);
    expect(supplyAmount).toBe(386_363);
    expect(vatAmount).toBe(38_637);
    expect(supplyAmount + vatAmount).toBe(425_000);
  });
});
