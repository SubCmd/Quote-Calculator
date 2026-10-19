import { describe, expect, it } from "vitest";
import { calculate } from "./calculate";
import type { RuleSet } from "./types";

/**
 * 픽스처 금액은 prisma/seed.ts 와 같다. (docs/pricing-rules.md 9절)
 * 네 상품 모두 확정값이다. (ADR-0026, ADR-0027, ADR-0028, ADR-0029, ADR-0030)
 * 금액이 바뀌면 이 파일의 기대값도 함께 갱신한다.
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
      dependsOnOptionCode: null,
      dependsOnOptionId: null,
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
  // 1회성 컨설팅에는 할인이 없다. 묶음은 조건이 아니라 V1 옵션의 정액이다. (ADR-0026)
  discounts: [],
  // V1 은 내신과 생활기록부를 합친 옵션이다. 안내만 하고 금액은 바꾸지 않는다. (ADR-0037)
  bundles: [
    { optionId: "opt-v1", componentOptionIds: ["opt-naesin", "opt-record"] },
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
      dependsOnOptionCode: null,
      dependsOnOptionId: null,
    },
    {
      id: "grp-channel",
      name: "소통 방식",
      required: false,
      singleSelect: true,
      dependsOnGroupId: "grp-sessions",
      dependsOnOptionCode: null,
      dependsOnOptionId: null,
    },
    {
      id: "grp-assignment",
      name: "수행평가 자료 요청",
      required: false,
      singleSelect: true,
      dependsOnGroupId: "grp-sessions",
      dependsOnOptionCode: null,
      dependsOnOptionId: null,
    },
    // 선행이 있으면서 복수 선택인 유일한 그룹이다. (ADR-0027)
    {
      id: "grp-extra",
      name: "추가 옵션",
      required: false,
      singleSelect: false,
      dependsOnGroupId: "grp-sessions",
      dependsOnOptionCode: null,
      dependsOnOptionId: null,
    },
  ],
  options: [
    {
      id: "opt-s3",
      groupId: "grp-sessions",
      name: "3회차 (1회당 60~80분)",
      amount: 580_000,
      versionId: "v-s3",
    },
    {
      id: "opt-s6",
      groupId: "grp-sessions",
      name: "6회차 (1회당 60~80분)",
      amount: 1_100_000,
      versionId: "v-s6",
    },
    {
      id: "opt-kakao",
      groupId: "grp-channel",
      name: "카톡 소통 (6개월)",
      amount: 390_000,
      versionId: "v-kakao",
    },
    {
      id: "opt-email",
      groupId: "grp-channel",
      name: "이메일 소통 (1년)",
      amount: 99_000,
      versionId: "v-email",
    },
    {
      id: "opt-extra-mock",
      groupId: "grp-extra",
      name: "모의고사 성적 분석 (30분)",
      amount: 59_000,
      versionId: "v-extra-mock",
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
  bundles: [],
};

/** 단계마다 금액이 다르다. 제목은 이름 안에 있다. (ADR-0028) */
const STAGE_AMOUNTS = [199_000, 249_000, 199_000, 149_000, 249_000, 490_000];

const STAGE_IDS = STAGE_AMOUNTS.map((_, i) => `opt-st${i + 1}`);

const allstoryG2: RuleSet = {
  product: { id: "prod-g2", name: "고2 올스토리" },
  groups: [
    {
      id: "grp-stage",
      name: "단계",
      required: false,
      singleSelect: false,
      dependsOnGroupId: null,
      dependsOnOptionCode: null,
      dependsOnOptionId: null,
    },
    // 6단계(수시 6장 최종 지원전략)를 골라야 열린다. 단계 그룹에 선택이 있는 것으로는
    // 충족되지 않는다. (ADR-0044)
    {
      id: "grp-finalcall",
      name: "경쟁률 분석",
      required: false,
      singleSelect: false,
      dependsOnGroupId: "grp-stage",
      dependsOnOptionCode: "STAGE_6",
      dependsOnOptionId: "opt-st6",
    },
  ],
  options: [
    ...STAGE_AMOUNTS.map((amount, i) => ({
      id: `opt-st${i + 1}`,
      groupId: "grp-stage",
      name: `${i + 1}단계`,
      amount,
      versionId: `v-st${i + 1}`,
    })),
    {
      id: "opt-finalcall",
      groupId: "grp-finalcall",
      name: "대학교 경쟁률 분석 (파이널콜)",
      amount: 490_000,
      versionId: "v-finalcall",
    },
  ],
  discounts: [
    {
      id: "disc-all-stages",
      name: "전단계 할인",
      // 통합등록 1,490,000원을 맞추는 정액이다. 비율로는 맞지 않는다. (ADR-0028)
      type: "FIXED",
      amount: 45_000,
      rateBp: 0,
      requiredOptionIds: STAGE_IDS,
      priority: 10,
      versionId: "v-all-stages",
    },
  ],
  bundles: [],
};

/**
 * 고3 1~4단계는 고2 3~6단계와 같은 상담이다. 번호만 상품 안에서 다시 붙는다. (ADR-0029)
 * 4단계 590,000원은 같은 상담인 고2 6단계 490,000원과 금액이 다르다. (ADR-0030)
 */
const G3_STAGE_AMOUNTS = [199_000, 149_000, 249_000, 590_000];

const G3_STAGE_IDS = G3_STAGE_AMOUNTS.map((_, i) => `opt-g3-st${i + 1}`);

const allstoryG3: RuleSet = {
  product: { id: "prod-g3", name: "고3 올스토리" },
  groups: [
    {
      id: "grp-g3-stage",
      name: "단계",
      required: false,
      singleSelect: false,
      dependsOnGroupId: null,
      dependsOnOptionCode: null,
      dependsOnOptionId: null,
    },
    // 고3은 4단계가 그 상담이다. 금액은 고2와 같은 490,000원이다. (ADR-0044)
    {
      id: "grp-g3-finalcall",
      name: "경쟁률 분석",
      required: false,
      singleSelect: false,
      dependsOnGroupId: "grp-g3-stage",
      dependsOnOptionCode: "STAGE_4",
      dependsOnOptionId: "opt-g3-st4",
    },
  ],
  options: [
    ...G3_STAGE_AMOUNTS.map((amount, i) => ({
      id: `opt-g3-st${i + 1}`,
      groupId: "grp-g3-stage",
      name: `${i + 1}단계`,
      amount,
      versionId: `v-g3-st${i + 1}`,
    })),
    {
      id: "opt-g3-finalcall",
      groupId: "grp-g3-finalcall",
      name: "대학교 경쟁률 분석 (파이널콜)",
      amount: 490_000,
      versionId: "v-g3-finalcall",
    },
  ],
  discounts: [
    {
      id: "disc-g3-all-stages",
      name: "전단계 할인",
      // 통합등록 1,150,000원을 맞추는 정액이다. 비율로는 맞지 않는다. (ADR-0030)
      type: "FIXED",
      amount: 37_000,
      rateBp: 0,
      requiredOptionIds: G3_STAGE_IDS,
      priority: 10,
      versionId: "v-g3-all-stages",
    },
  ],
  bundles: [],
};

/**
 * 정시 상담. 단계가 각각 다른 그룹이고 사이에 **안내 전용 단계**가 끼어 있다. (ADR-0048)
 * 안내 단계는 옵션을 가지지 않으므로 계산 레이어에는 빈 그룹으로만 보인다.
 * 금액에 들어갈 길도 위반을 만들 길도 없다는 것이 아래 테스트가 고정하는 내용이다.
 */
const jeongsi: RuleSet = {
  product: { id: "prod-js", name: "정시 상담" },
  groups: [
    {
      id: "grp-js-step1",
      name: "1단계 (유선상담)",
      required: false,
      singleSelect: false,
      dependsOnGroupId: null,
      dependsOnOptionCode: null,
      dependsOnOptionId: null,
    },
    {
      id: "grp-js-questionnaire",
      name: "2단계 (사전 질문지 양식 제공)",
      required: false,
      singleSelect: false,
      dependsOnGroupId: null,
      dependsOnOptionCode: null,
      dependsOnOptionId: null,
    },
    {
      id: "grp-js-line",
      name: "3단계 (정시 대학라인 상담)",
      required: false,
      singleSelect: false,
      dependsOnGroupId: null,
      dependsOnOptionCode: null,
      dependsOnOptionId: null,
    },
    // 지원할 대학을 정하는 상담이 대학라인 상담이다. (ADR-0044)
    {
      id: "grp-js-finalcall",
      name: "경쟁률 분석",
      required: false,
      singleSelect: false,
      dependsOnGroupId: "grp-js-line",
      dependsOnOptionCode: "LINE",
      dependsOnOptionId: "opt-js-line",
    },
  ],
  options: [
    {
      id: "opt-js-step1",
      groupId: "grp-js-step1",
      name: "1단계 유선상담 (30~60분)",
      amount: 89_000,
      versionId: "v-js-step1",
    },
    {
      id: "opt-js-line",
      groupId: "grp-js-line",
      name: "정시 대학라인 상담 (60~80분 비대면 zoom)",
      amount: 490_000,
      versionId: "v-js-line",
    },
    {
      id: "opt-js-finalcall",
      groupId: "grp-js-finalcall",
      name: "대학교 경쟁률 분석 (파이널콜)",
      amount: 490_000,
      versionId: "v-js-finalcall",
    },
  ],
  discounts: [],
  bundles: [],
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
      dependsOnOptionCode: null,
      dependsOnOptionId: null,
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
  bundles: [],
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
  it("분석 항목 3개를 선택하면 할인 없이 소계가 그대로 총액이다", () => {
    const result = ok(oneshot, ["opt-naesin", "opt-mock", "opt-record"]);

    expect(result.items[0]?.optionAmount).toBe(267_000);
    expect(result.subtotal).toBe(267_000);
    expect(result.discountCandidates).toHaveLength(0);
    expect(result.appliedDiscount).toBeNull();
    expect(result.discountAmount).toBe(0);
    expect(result.totalAmount).toBe(267_000);
  });

  it("묶음 옵션 하나만 선택하면 그 정액이 총액이다", () => {
    const result = ok(oneshot, ["opt-v1"]);

    expect(result.subtotal).toBe(199_000);
    expect(result.appliedDiscount).toBeNull();
    expect(result.totalAmount).toBe(199_000);
  });

  // 묶음은 할인 규칙이 아니라 별도 옵션의 정액이다. 따로 고르면 더 비싼 것이 정상이다. (ADR-0026)
  it("묶음 옵션이 같은 구성을 따로 고르는 것보다 싸다", () => {
    const bundled = ok(oneshot, ["opt-v1"]);
    const separate = ok(oneshot, ["opt-naesin", "opt-record"]);

    expect(bundled.totalAmount).toBe(199_000);
    expect(separate.totalAmount).toBe(208_000);
  });

  it("선택 항목별 금액을 분해해서 반환한다", () => {
    const result = ok(oneshot, ["opt-naesin", "opt-record"]);

    expect(result.items[0]?.appliedOptions).toEqual([
      { optionId: "opt-naesin", name: "내신 성적 분석 (30분)", amount: 59_000 },
      {
        optionId: "opt-record",
        name: "생활기록부 분석 (1시간)",
        amount: 149_000,
      },
    ]);
  });

  it("적용된 가격 규칙 버전을 모두 기록한다", () => {
    const result = ok(oneshot, ["opt-naesin", "opt-mock", "opt-record"]);

    expect(result.pricingRuleVersionIds).toEqual([
      "v-naesin",
      "v-mock",
      "v-record",
    ]);
    expect(result.calculatedAt).toBe(NOW);
  });
});

describe("calculate - 묶음 안내 (docs/pricing-rules.md 10절, ADR-0037)", () => {
  it("구성 옵션을 전부 고르면 안내가 붙지만 총액은 그대로다", () => {
    const result = ok(oneshot, ["opt-naesin", "opt-record"]);

    expect(result.totalAmount).toBe(208_000);
    expect(result.bundleSuggestions).toEqual([
      {
        optionId: "opt-v1",
        name: "내신 + 생활기록부 분석 (60~70분)",
        nextOptionIds: ["opt-v1"],
        savingAmount: 9000,
      },
    ]);
  });

  it("안내한 선택으로 다시 계산하면 안내한 절약액만큼 줄어든다", () => {
    const before = ok(oneshot, ["opt-naesin", "opt-record"]);
    const suggestion = before.bundleSuggestions[0]!;
    const after = ok(oneshot, suggestion.nextOptionIds);

    expect(before.totalAmount - after.totalAmount).toBe(
      suggestion.savingAmount,
    );
    expect(after.totalAmount).toBe(199_000);
  });

  it("안내한 선택은 묶음과 무관한 선택을 남긴다", () => {
    const result = ok(oneshot, ["opt-naesin", "opt-mock", "opt-record"]);

    expect(result.totalAmount).toBe(267_000);
    expect(result.bundleSuggestions[0]?.nextOptionIds).toEqual([
      "opt-mock",
      "opt-v1",
    ]);
    expect(result.bundleSuggestions[0]?.savingAmount).toBe(9000);
  });

  it("구성 옵션 중 하나라도 빠지면 안내하지 않는다", () => {
    expect(ok(oneshot, ["opt-naesin"]).bundleSuggestions).toEqual([]);
    expect(ok(oneshot, ["opt-record"]).bundleSuggestions).toEqual([]);
    expect(ok(oneshot, ["opt-naesin", "opt-mock"]).bundleSuggestions).toEqual(
      [],
    );
  });

  it("이미 묶음을 고른 선택에는 안내하지 않는다", () => {
    expect(ok(oneshot, ["opt-v1"]).bundleSuggestions).toEqual([]);
    expect(
      ok(oneshot, ["opt-v1", "opt-naesin", "opt-record"]).bundleSuggestions,
    ).toEqual([]);
  });

  it("묶음 관계가 없는 상품에는 안내가 없다", () => {
    expect(ok(course, ["opt-s6", "opt-kakao"]).bundleSuggestions).toEqual([]);
    expect(ok(allstoryG2, STAGE_IDS).bundleSuggestions).toEqual([]);
  });

  it("안내는 견적 스냅샷 근거에 들어가지 않는다", () => {
    const result = ok(oneshot, ["opt-naesin", "opt-record"]);

    expect(result.bundleSuggestions).toHaveLength(1);
    expect(result.pricingRuleVersionIds).toEqual(["v-naesin", "v-record"]);
  });
});

describe("calculate - 과정 컨설팅 (docs/pricing-rules.md 9-3)", () => {
  it("6회차 + 카톡 + 10건 조합의 금액을 합산한다", () => {
    const result = ok(course, ["opt-s6", "opt-kakao", "opt-a10"]);

    expect(result.subtotal).toBe(1_940_000);
    expect(result.appliedDiscount).toBeNull();
    expect(result.totalAmount).toBe(1_940_000);
  });

  it("회차는 수량이 아니다. 6회차가 3회차의 두 배가 아니어도 된다", () => {
    const three = ok(course, ["opt-s3"]);
    const six = ok(course, ["opt-s6"]);

    expect(three.totalAmount).toBe(580_000);
    expect(six.totalAmount).toBe(1_100_000);
  });

  it("소통 방식만 바꾸면 그 차액만큼만 달라진다", () => {
    const kakao = ok(course, ["opt-s3", "opt-kakao"]);
    const email = ok(course, ["opt-s3", "opt-email"]);

    expect(kakao.totalAmount).toBe(970_000);
    expect(email.totalAmount).toBe(679_000);
  });

  it("추가 옵션은 회차에 더해진다 (9-3-1)", () => {
    const result = ok(course, ["opt-s3", "opt-extra-mock"]);

    expect(result.subtotal).toBe(639_000);
    expect(result.totalAmount).toBe(639_000);
  });

  it("추가 옵션은 복수 선택이라 회차·소통 방식과 함께 고를 수 있다", () => {
    const result = ok(course, ["opt-s6", "opt-email", "opt-extra-mock"]);

    expect(result.totalAmount).toBe(1_258_000);
  });

  it("회차 없이 추가 옵션만 고르면 선행 위반이다", () => {
    const result = run(course, ["opt-extra-mock"]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations[0]?.code).toBe("GROUP_PREREQUISITE_UNMET");
    expect(result.violations[0]?.groupId).toBe("grp-extra");
  });
});

describe("calculate - 고2 올스토리 (docs/pricing-rules.md 9-4)", () => {
  it("전단계를 선택하면 총액이 통합등록 금액이 된다", () => {
    const result = ok(allstoryG2, STAGE_IDS);

    expect(result.subtotal).toBe(1_535_000);
    expect(result.appliedDiscount?.discountId).toBe("disc-all-stages");
    expect(result.discountAmount).toBe(45_000);
    expect(result.totalAmount).toBe(1_490_000);
  });

  it("단계 하나가 빠지면 할인이 걸리지 않는다", () => {
    const result = ok(allstoryG2, STAGE_IDS.slice(0, 5));

    expect(result.subtotal).toBe(1_045_000);
    expect(result.discountCandidates).toHaveLength(0);
    expect(result.totalAmount).toBe(1_045_000);
  });

  // 정액 할인이라 어느 단계를 빼는지에 따라 금액이 달라진다. 비율이 아니다. (ADR-0028)
  it("단계는 수량이 아니다. 단계마다 금액이 다르다", () => {
    expect(ok(allstoryG2, ["opt-st4"]).totalAmount).toBe(149_000);
    expect(ok(allstoryG2, ["opt-st6"]).totalAmount).toBe(490_000);
  });

  it("어느 단계를 빼는지에 따라 소계가 달라진다", () => {
    const withoutSixth = ok(allstoryG2, STAGE_IDS.slice(0, 5));
    const withoutFourth = ok(
      allstoryG2,
      STAGE_IDS.filter((id) => id !== "opt-st4"),
    );

    expect(withoutSixth.totalAmount).toBe(1_045_000);
    expect(withoutFourth.totalAmount).toBe(1_386_000);
  });
});

describe("calculate - 파이널콜 선행 옵션 (ADR-0044)", () => {
  it("6단계와 파이널콜을 함께 고르면 둘이 더해진다", () => {
    const result = ok(allstoryG2, ["opt-st6", "opt-finalcall"]);

    expect(result.subtotal).toBe(980_000);
    expect(result.totalAmount).toBe(980_000);
  });

  it("전단계에 파이널콜을 더하면 통합등록 금액에 더해진다", () => {
    const result = ok(allstoryG2, [...STAGE_IDS, "opt-finalcall"]);

    expect(result.subtotal).toBe(2_025_000);
    expect(result.discountAmount).toBe(45_000);
    expect(result.totalAmount).toBe(1_980_000);
  });

  it("파이널콜은 전단계 할인 조건에 들어가지 않는다", () => {
    const withFinalcall = ok(allstoryG2, [...STAGE_IDS, "opt-finalcall"]);
    const stagesOnly = ok(allstoryG2, STAGE_IDS);

    expect(withFinalcall.discountAmount).toBe(stagesOnly.discountAmount);
  });

  it("단계를 하나도 고르지 않고 파이널콜만 고르면 위반이다", () => {
    const result = run(allstoryG2, ["opt-finalcall"]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations[0]?.code).toBe("OPTION_PREREQUISITE_UNMET");
    expect(result.violations[0]?.groupId).toBe("grp-finalcall");
  });

  // 그룹 단위 선행이라면 통과했을 선택이다. 선행이 옵션 하나로 좁혀진 것이 여기서 드러난다.
  it("6단계를 빼고 1~5단계와 파이널콜을 고르면 위반이다", () => {
    const result = run(allstoryG2, [...STAGE_IDS.slice(0, 5), "opt-finalcall"]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations[0]?.code).toBe("OPTION_PREREQUISITE_UNMET");
  });

  it("위반 사유에 선행 옵션 이름이 들어간다", () => {
    const result = run(allstoryG2, ["opt-finalcall"]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations[0]?.message).toBe(
      "먼저 '6단계' 을(를) 선택해 주세요.",
    );
  });

  it("선행 옵션이 해석되지 않으면 옵션 코드 없이 거부한다", () => {
    const unresolved: RuleSet = {
      ...allstoryG2,
      groups: allstoryG2.groups.map((g) =>
        g.id === "grp-finalcall" ? { ...g, dependsOnOptionId: null } : g,
      ),
    };

    const result = run(unresolved, ["opt-st6", "opt-finalcall"]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations[0]?.code).toBe("OPTION_PREREQUISITE_UNMET");
    expect(result.violations[0]?.message).toBe(
      "지금은 선택할 수 없는 항목입니다.",
    );
  });

  it("고3은 4단계를 골라야 파이널콜이 열린다", () => {
    const met = ok(allstoryG3, ["opt-g3-st4", "opt-g3-finalcall"]);
    const unmet = run(allstoryG3, ["opt-g3-st1", "opt-g3-finalcall"]);

    expect(met.totalAmount).toBe(1_080_000);
    expect(unmet.ok).toBe(false);
    if (unmet.ok) return;
    expect(unmet.violations[0]?.code).toBe("OPTION_PREREQUISITE_UNMET");
  });

  it("고3 전단계에 파이널콜을 더하면 통합등록 금액에 더해진다", () => {
    const result = ok(allstoryG3, [...G3_STAGE_IDS, "opt-g3-finalcall"]);

    expect(result.totalAmount).toBe(1_640_000);
  });

  it("파이널콜을 고르지 않은 것은 위반이 아니다", () => {
    const result = ok(allstoryG2, ["opt-st6"]);

    expect(result.totalAmount).toBe(490_000);
  });
});

describe("calculate - 고3 올스토리 (docs/pricing-rules.md 9-4-1)", () => {
  it("전단계를 선택하면 총액이 통합등록 금액이 된다", () => {
    const result = ok(allstoryG3, G3_STAGE_IDS);

    expect(result.subtotal).toBe(1_187_000);
    expect(result.appliedDiscount?.discountId).toBe("disc-g3-all-stages");
    expect(result.discountAmount).toBe(37_000);
    expect(result.totalAmount).toBe(1_150_000);
  });

  it("단계 하나가 빠지면 할인이 걸리지 않는다", () => {
    const result = ok(allstoryG3, G3_STAGE_IDS.slice(0, 3));

    expect(result.subtotal).toBe(597_000);
    expect(result.discountCandidates).toHaveLength(0);
    expect(result.totalAmount).toBe(597_000);
  });

  // 같은 상담이어도 금액은 상품마다 따로 정해진다. (ADR-0030)
  it("고3 4단계는 같은 상담인 고2 6단계보다 비싸다", () => {
    expect(ok(allstoryG3, ["opt-g3-st4"]).totalAmount).toBe(590_000);
    expect(ok(allstoryG2, ["opt-st6"]).totalAmount).toBe(490_000);
  });

  it("고3 1단계는 고2 3단계와 금액이 같다", () => {
    expect(ok(allstoryG3, ["opt-g3-st1"]).totalAmount).toBe(199_000);
    expect(ok(allstoryG2, ["opt-st3"]).totalAmount).toBe(199_000);
  });
});

describe("calculate - 정시 상담 (docs/pricing-rules.md 9-5)", () => {
  it("1단계와 대학라인 상담, 파이널콜을 고르면 할인 없이 소계가 총액이다", () => {
    const result = ok(jeongsi, [
      "opt-js-step1",
      "opt-js-line",
      "opt-js-finalcall",
    ]);

    expect(result.subtotal).toBe(1_069_000);
    expect(result.discountCandidates).toHaveLength(0);
    expect(result.discountAmount).toBe(0);
    expect(result.totalAmount).toBe(1_069_000);
  });

  it("파이널콜을 빼면 1단계와 대학라인 상담의 합이다", () => {
    const result = ok(jeongsi, ["opt-js-step1", "opt-js-line"]);

    expect(result.totalAmount).toBe(579_000);
  });

  // 안내 전용 단계는 옵션이 없다. 금액에도 위반에도 나타날 길이 없다. (ADR-0048)
  it("안내 전용 단계가 있어도 1단계만 고르면 그 금액 그대로다", () => {
    const result = ok(jeongsi, ["opt-js-step1"]);

    expect(result.items[0]?.appliedOptions).toHaveLength(1);
    expect(result.totalAmount).toBe(89_000);
  });

  it("안내 전용 단계가 있어도 아무것도 고르지 않으면 위반 없이 0원이다", () => {
    const result = ok(jeongsi, []);

    expect(result.totalAmount).toBe(0);
  });

  it("대학라인 상담을 고르지 않고 파이널콜만 고르면 계산을 거부한다", () => {
    const result = run(jeongsi, ["opt-js-finalcall"]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations[0]?.groupId).toBe("grp-js-finalcall");
  });
});

describe("calculate - 선택 없음 (docs/pricing-rules.md 9-6)", () => {
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
    ["고2 올스토리 전단계", allstoryG2, STAGE_IDS],
    ["고2 올스토리 1단계", allstoryG2, ["opt-st1"]],
    ["고3 올스토리 전단계", allstoryG3, G3_STAGE_IDS],
    ["정시 전체", jeongsi, ["opt-js-step1", "opt-js-line", "opt-js-finalcall"]],
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
    expect(result.totalAmount).toBe(970_000);
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
