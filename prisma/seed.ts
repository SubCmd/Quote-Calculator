import { PrismaClient } from "@prisma/client";

/**
 * 입시 컨설팅 상품 5종. (docs/requirements.md 3절)
 *
 * 금액은 모두 현금가이고 원 단위 정수다. (ADR-0039)
 * 다섯 상품 모두 확정값이다. 임시값은 남아 있지 않다.
 * (ADR-0026, ADR-0027, ADR-0028, ADR-0029, ADR-0030, ADR-0048)
 * 교체할 때 이 파일의 숫자만 고치면 된다. 코드 수정은 필요하지 않다.
 */
const prisma = new PrismaClient();

const EFFECTIVE_FROM = new Date("2026-01-01T00:00:00.000Z");

/**
 * 소요 시간은 `name` 안에 넣는다. 별도 컬럼을 두지 않는다. (ADR-0026)
 * `summary` 는 금액이 아니라 안내문이라 `OptionDescription` 으로 따로 저장된다. (ADR-0025)
 */
type OptionSeed = {
  code: string;
  name: string;
  amount: number;
  /// 이름 바로 아래 항상 보이는 한 줄
  summary?: string;
  /// `<details>` 로 접히는 긴 설명. 한 문단짜리는 이쪽이다
  detail?: string;
};

type GroupSeed = {
  code: string;
  name: string;
  required: boolean;
  singleSelect: boolean;
  /// 그룹 옵션을 한 번에 켜는 버튼을 둘지. 전부 고르는 것이 말이 되는 그룹만 (ADR-0043)
  selectAll?: boolean;
  /// 고를 것이 없는 안내 전용 단계인지. 옵션이 없고 금액을 만들지 않는다 (ADR-0048)
  noticeOnly?: boolean;
  /// 단계 이름 아래 항상 보이는 한 줄. 그룹 설명은 `OptionGroup` 컬럼이다 (ADR-0025)
  summary?: string;
  /// `<details>` 로 접히는 긴 설명
  detail?: string;
  /// 이 그룹을 고르기 전에 선택이 있어야 하는 그룹의 코드 (ADR-0010)
  dependsOn?: string;
  /// 선행 그룹에서 골라야 하는 **옵션** 코드. 없으면 그룹에 선택이 있으면 충족 (ADR-0044)
  dependsOnOption?: string;
  options: OptionSeed[];
};

type DiscountSeed = {
  code: string;
  name: string;
  type: "FIXED" | "RATE";
  amount?: number;
  /// Decimal 문자열. 15% = '0.1500'
  rate?: string;
  priority: number;
  /// 전부 선택해야 후보가 되는 옵션. 비우면 항상 후보 (ADR-0009)
  conditions: { groupCode: string; optionCode: string }[];
};

/**
 * 묶음 옵션과 그 구성 옵션. 금액에 들어가지 않고 안내만 한다. (ADR-0037)
 * 구성 옵션을 전부 고른 고객에게 더 싼 묶음을 알려 주는 데만 쓴다.
 */
type BundleSeed = {
  groupCode: string;
  optionCode: string;
  components: { groupCode: string; optionCode: string }[];
};

type ProductSeed = {
  code: string;
  name: string;
  groups: GroupSeed[];
  discounts: DiscountSeed[];
  bundles?: BundleSeed[];
};

/** 3회차·6회차가 같은 안내문을 쓴다. 받는 상담 내용이 같고 횟수만 다르다. */
const COURSE_SESSION_SUMMARY =
  "내신 성적 수준, 대학교 수준, 대학교 지원 어디까지 가능한지? 소개 및 생활기록부 수준, 전공적합성 코칭, 지원 대학 수준 학생부 종합전형 원리 코칭";

/** 5건·10건이 같은 안내문을 쓴다. 건수만 다르다. */
const COURSE_ASSIGNMENT_SUMMARY =
  "기간은 고3 7월까지 / 창체활동 수행평가 가능 (채점기준표가 제시된 수행평가는 진행되지 않습니다.)";

/**
 * 올스토리 상담 단계의 **문구**. 고2는 여섯 단계 전부이고, 고3은 뒤 네 단계다.
 * 고2 3~6단계와 고3 1~4단계가 같은 상담이라 문구를 한 곳에 두고 나눠 쓴다. (ADR-0029)
 *
 * **금액은 여기 없다.** 같은 상담이어도 상품마다 값이 달라서 상품 쪽에 있다. (ADR-0030)
 * 단계 번호도 없다. 상품 안에서의 순서라서 `numberedStages` 가 붙인다.
 *
 * 세 자리로 나뉜다. (ADR-0031)
 * 이름은 `1단계 (60~80분)` 까지이고 상담 제목은 `summary` 로 내려간다.
 * 이름이 번호와 금액의 한정만 담으면 체크박스 줄이 짧아져서 단계 여섯 개가 한눈에 비교된다.
 */
type StageText = {
  /** 이름의 괄호 안. 소요 시간과 금액의 한정이 들어간다. 견적 스냅샷에 남는다. */
  qualifier: string;
  /** 상담 제목. 이름 아래 항상 보이는 한 줄이다. (ADR-0025) */
  summary: string;
  /** 펼치기(`<details>`) 안의 한 문단. */
  detail: string;
};

const ALLSTORY_STAGE_TEXT: StageText[] = [
  {
    qualifier: "60~80분",
    summary: "고2 생기부 방향성 컨설팅",
    detail:
      "내신 성적과 기존 생기부를 분석해 희망 대학·학과에 필요한 역량을 점검하고, 학생의 강점과 관심 분야를 반영한 과목별 탐구 주제 및 활동 방향을 설정함.",
  },
  {
    // `첨삭 제외` 는 금액의 한정이라 설명이 아니라 이름에 남는다. (ADR-0028)
    qualifier: "60~80분, 첨삭 제외",
    summary: "고2 생기부 작성·보완 컨설팅",
    detail:
      "고2 세특·자율·진로·동아리 활동을 점검하고, 실제 활동에서 나타난 탐구 과정과 배운 점이 생기부에 제대로 기록될 수 있도록 활동 내용 정리와 근거 자료 준비를 지원함.",
  },
  {
    qualifier: "60~80분",
    summary: "고3 활동 방향성 제시 및 심화탐구 설계",
    detail:
      "고2 활동과 희망 전공을 바탕으로 고3 활동 방향성을 제시하고, 기존 탐구를 발전시킬 수 있는 과목별 심화탐구·독서·발표·동아리 활동 계획을 구체화함.",
  },
  {
    qualifier: "60~80분",
    summary: "고3 3월 모의고사 성적표 분석 및 수시·정시 방향 상담",
    detail:
      "고3 3월 모의고사 성적표를 분석해 영역별 강점과 보완점, 정시 지원 가능성을 점검하고, 수시 중심으로 준비할지, 정시에 집중할지, 수시와 정시를 병행할지에 대한 입시 준비 방향을 설명함.",
  },
  {
    qualifier: "60~80분",
    summary: "고3 수시 대비 생기부 작성·보완 컨설팅",
    detail:
      "고3 1학기 세특과 주요 활동을 종합 점검하고, 실제 활동에서 드러난 학업역량·진로역량·공동체역량이 생기부에 제대로 기록될 수 있도록 핵심 활동 내용과 근거 자료 정리를 지원함.",
  },
  {
    qualifier: "60~80분",
    summary: "수시 6장 대학·학과·전형 최종 지원전략",
    detail:
      "내신·생기부 경쟁력과 수능 최저학력기준 충족 가능성, 면접 일정을 함께 검토해 상향·적정·안정 지원 조합을 구성하고, 수시 6장의 대학·학과·전형별 최종 지원전략을 수립함.",
  },
];

/** 고3은 뒤 네 단계다. 고2 3단계가 고3 1단계가 된다. (ADR-0029) */
const ALLSTORY_G3_FROM = 2;

/**
 * 단계 금액. 상품마다 따로 있다. 같은 상담이어도 값이 같다는 보장이 없다. (ADR-0030)
 * 고3 4단계 590,000원은 같은 상담인 고2 6단계 490,000원과 다르다.
 */
const ALLSTORY_G2_AMOUNTS = [
  199_000, 249_000, 199_000, 149_000, 249_000, 490_000,
];
const ALLSTORY_G3_AMOUNTS = [199_000, 149_000, 249_000, 590_000];

/** 단계 번호는 그 상품 안에서 1부터 붙는다. `code` 도 그 번호를 따른다. (ADR-0029) */
function numberedStages(text: StageText[], amounts: number[]): OptionSeed[] {
  return amounts.map((amount, i) => {
    const stage = text[i];
    if (!stage) throw new Error(`${i + 1}단계 문구가 없다`);
    return {
      code: `STAGE_${i + 1}`,
      name: `${i + 1}단계 (${stage.qualifier})`,
      amount,
      summary: stage.summary,
      detail: stage.detail,
    };
  });
}

/**
 * 파이널콜은 세 상품에 같은 이름·금액·문구로 들어간다. 다른 것은 선행 단계뿐이다. (ADR-0044)
 * 고2는 6단계, 고3은 4단계이고 둘 다 수시 6장 최종 지원전략 상담이다.
 * 정시는 대학라인 상담이고, 셋 다 지원할 대학을 정하는 상담이다.
 * 지원할 대학을 정하지 않은 고객에게 경쟁률을 분석할 대상이 없다.
 *
 * 단계와 **다른 그룹**이다. 같은 그룹에 두면 `모두 선택` 버튼이 함께 켠다. (ADR-0043)
 */
function finalcallGroup(
  dependsOnGroup: string,
  dependsOnOption: string,
): GroupSeed {
  return {
    code: "FINALCALL",
    name: "경쟁률 분석",
    required: false,
    singleSelect: false,
    dependsOn: dependsOnGroup,
    dependsOnOption,
    options: [
      {
        code: "FINALCALL",
        name: "대학교 경쟁률 분석 (파이널콜)",
        amount: 490_000,
        summary:
          "대학교와 학과의 경쟁률을 분석해서 더 유리한 곳으로 추천해주는 프로그램",
      },
    ],
  };
}

function allStagesCondition(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    groupCode: "STAGE",
    optionCode: `STAGE_${i + 1}`,
  }));
}

const PRODUCTS: ProductSeed[] = [
  {
    code: "ONESHOT",
    name: "1회성 컨설팅",
    groups: [
      {
        code: "ANALYSIS",
        name: "분석 항목",
        required: false,
        singleSelect: false,
        options: [
          {
            code: "NAESIN",
            name: "내신 성적 분석 (30분)",
            amount: 59_000,
            summary:
              "내신 성적 수준, 대학교 수준, 대학교 지원 어디까지 가능한지?",
          },
          {
            code: "MOCK",
            name: "모의고사 성적 분석 (30분)",
            amount: 59_000,
            summary:
              "대학교 수준, 대학교 지원 어디까지 가능한지, 국영수 학업 방향성(고3 6, 9월 제외) 고1, 2까지는 분석 가능",
          },
          {
            code: "RECORD",
            name: "생활기록부 분석 (1시간)",
            amount: 149_000,
            summary:
              "생활기록부 수준, 전공적합성 코칭, 지원 대학 수준 학생부 종합전형 원리 코칭",
          },
          {
            code: "V1",
            name: "내신 + 생활기록부 분석 (60~70분)",
            amount: 199_000,
          },
        ],
      },
    ],
    // 1회성 컨설팅에는 할인이 없다. 묶음은 할인 조건이 아니라 V1 옵션의 정액이다. (ADR-0026)
    discounts: [],
    // V1 은 내신과 생활기록부를 합친 상담이다. 둘을 따로 고른 고객에게 안내한다. (ADR-0037)
    bundles: [
      {
        groupCode: "ANALYSIS",
        optionCode: "V1",
        components: [
          { groupCode: "ANALYSIS", optionCode: "NAESIN" },
          { groupCode: "ANALYSIS", optionCode: "RECORD" },
        ],
      },
    ],
  },
  {
    code: "COURSE",
    name: "과정 컨설팅",
    groups: [
      {
        code: "SESSIONS",
        name: "회차",
        required: false,
        singleSelect: true,
        options: [
          {
            code: "S3",
            name: "3회차 (1회당 60~80분)",
            amount: 580_000,
            summary: COURSE_SESSION_SUMMARY,
          },
          {
            code: "S6",
            name: "6회차 (1회당 60~80분)",
            amount: 1_100_000,
            summary: COURSE_SESSION_SUMMARY,
          },
        ],
      },
      {
        code: "CHANNEL",
        name: "소통 방식",
        required: false,
        singleSelect: true,
        dependsOn: "SESSIONS",
        options: [
          {
            code: "KAKAO",
            name: "카톡 소통 (6개월)",
            amount: 390_000,
            summary:
              "전용 카카오톡 상담방 개설, 회차 사이에도 질문·자료 전달 가능, 6개월 이용",
          },
          {
            code: "EMAIL",
            name: "이메일 소통 (1년)",
            amount: 99_000,
            summary:
              "네이버 이메일로 자료·질문 전달, 회차 사이에도 상담 가능, 1년 이용",
          },
        ],
      },
      {
        code: "ASSIGNMENT",
        name: "수행평가 자료 요청",
        required: false,
        singleSelect: true,
        dependsOn: "SESSIONS",
        options: [
          {
            code: "A5",
            name: "5건",
            amount: 250_000,
            summary: COURSE_ASSIGNMENT_SUMMARY,
          },
          {
            code: "A10",
            name: "10건",
            amount: 450_000,
            summary: COURSE_ASSIGNMENT_SUMMARY,
          },
        ],
      },
      {
        // 회차 중간에 끼워 넣는 상담이다. 다른 선택을 대체하지 않으므로 복수 선택이다. (ADR-0027)
        code: "EXTRA",
        name: "추가 옵션",
        required: false,
        singleSelect: false,
        dependsOn: "SESSIONS",
        options: [
          {
            // 1회성 컨설팅의 MOCK 과 같은 코드지만 그룹이 달라 별개 옵션이다. (ADR-0027)
            code: "MOCK",
            name: "모의고사 성적 분석 (30분)",
            amount: 59_000,
            summary:
              "대학교 수준, 대학교 지원 어디까지 가능한지, 국영수 학업 방향성(고3 6, 9월 제외) 고1, 2까지는 분석 가능",
          },
        ],
      },
    ],
    discounts: [],
  },
  {
    code: "ALLSTORY_G2",
    name: "고2 올스토리",
    groups: [
      {
        code: "STAGE",
        name: "단계",
        required: false,
        singleSelect: false,
        // 전단계 등록이 가장 흔한 선택이고 전단계 할인도 있다. (ADR-0043)
        selectAll: true,
        options: numberedStages(ALLSTORY_STAGE_TEXT, ALLSTORY_G2_AMOUNTS),
      },
      finalcallGroup("STAGE", "STAGE_6"),
    ],
    discounts: [
      {
        code: "ALL_STAGES",
        name: "전단계 할인",
        // 통합등록 1,490,000원은 단계 합에서 유도된 값이 아니라 따로 정해진 값이다.
        // 비율로는 이 금액이 정확히 나오지 않아 정액으로 둔다. (ADR-0028)
        // 단계 합 1,535,000 - 통합등록 1,490,000 = 45,000.
        // 단계 금액을 바꾸면 이 값도 다시 계산해야 한다.
        type: "FIXED",
        amount: 45_000,
        priority: 10,
        conditions: allStagesCondition(6),
      },
    ],
  },
  {
    code: "ALLSTORY_G3",
    name: "고3 올스토리",
    groups: [
      {
        code: "STAGE",
        name: "단계",
        required: false,
        singleSelect: false,
        // 고2와 같은 이유다. (ADR-0043)
        selectAll: true,
        options: numberedStages(
          ALLSTORY_STAGE_TEXT.slice(ALLSTORY_G3_FROM),
          ALLSTORY_G3_AMOUNTS,
        ),
      },
      finalcallGroup("STAGE", "STAGE_4"),
    ],
    discounts: [
      {
        code: "ALL_STAGES",
        name: "전단계 할인",
        // 통합등록 1,150,000원도 단계 합에서 유도된 값이 아니다. 고2와 같이 정액이다. (ADR-0030)
        // 단계 합 1,187,000 - 통합등록 1,150,000 = 37,000.
        // 단계 금액을 바꾸면 이 값도 다시 계산해야 한다.
        type: "FIXED",
        amount: 37_000,
        priority: 10,
        conditions: allStagesCondition(4),
      },
    ],
  },
  {
    // 정시는 단계가 순서대로 진행되고 각 단계가 따로 선택된다. 올스토리처럼 한 그룹에
    // 묶지 않는다. 사이에 고를 것이 없는 안내 단계가 끼기 때문이다. (ADR-0048)
    code: "JEONGSI",
    name: "정시 상담",
    groups: [
      {
        code: "STEP1",
        name: "1단계 (유선상담)",
        required: false,
        singleSelect: false,
        options: [
          {
            code: "STEP1",
            name: "1단계 유선상담 (30~60분)",
            amount: 89_000,
          },
        ],
      },
      {
        // 고를 것이 없다. 그래도 자리를 남겨 그 단계가 있다는 것을 보여준다. (ADR-0048)
        code: "QUESTIONNAIRE",
        name: "2단계 (사전 질문지 양식 제공)",
        required: false,
        singleSelect: false,
        noticeOnly: true,
        summary:
          "상담 전에 사전 질문지 양식을 보내 드립니다. 따로 고르실 것은 없습니다.",
        options: [],
      },
      {
        code: "LINE",
        name: "3단계 (정시 대학라인 상담)",
        required: false,
        singleSelect: false,
        options: [
          {
            code: "LINE",
            name: "정시 대학라인 상담 (60~80분 비대면 zoom)",
            amount: 490_000,
          },
        ],
      },
      finalcallGroup("LINE", "LINE"),
    ],
    discounts: [],
  },
];

async function seedProduct(seed: ProductSeed, sortOrder: number) {
  const product = await prisma.product.create({
    data: { code: seed.code, name: seed.name, sortOrder },
  });

  // 선행 그룹은 같은 상품 안의 앞선 그룹만 가리킨다. 순서대로 만들면서 id 를 모은다.
  const groupIdByCode = new Map<string, string>();

  for (const [groupIndex, group] of seed.groups.entries()) {
    const dependsOnGroupId = group.dependsOn
      ? groupIdByCode.get(group.dependsOn)
      : null;
    if (group.dependsOn && !dependsOnGroupId) {
      throw new Error(
        `${seed.code}: 선행 그룹 '${group.dependsOn}' 을 앞에서 찾을 수 없습니다.`,
      );
    }
    // 안내 전용 단계의 불변식. 서버가 거부하는 조합을 시드로 우회하지 않는다. (ADR-0048)
    if (group.noticeOnly) {
      if (group.options.length > 0)
        throw new Error(
          `${seed.code}: 안내 전용 단계 '${group.code}' 에 옵션을 둘 수 없습니다.`,
        );
      if (group.required || group.selectAll)
        throw new Error(
          `${seed.code}: 안내 전용 단계 '${group.code}' 는 필수·모두 선택을 켤 수 없습니다.`,
        );
      if (!group.summary && !group.detail)
        throw new Error(
          `${seed.code}: 안내 전용 단계 '${group.code}' 에 설명이 없으면 빈 줄만 보입니다.`,
        );
    }
    // 안내 전용 단계는 선택이 생길 수 없어서 가리킨 쪽이 영구히 잠긴다. (ADR-0048)
    if (group.dependsOn) {
      const prerequisite = seed.groups.find((g) => g.code === group.dependsOn);
      if (prerequisite?.noticeOnly)
        throw new Error(
          `${seed.code}: 안내 전용 단계 '${group.dependsOn}' 을 선행 단계로 둘 수 없습니다.`,
        );
    }
    // 선행 옵션 코드가 틀리면 그 그룹은 조용히 잠긴 채로 남는다. (ADR-0044)
    // 해석 실패를 닫힌 쪽으로 처리하기 때문에 화면에 오류가 보이지 않는다. 여기서 잡는다.
    if (group.dependsOnOption) {
      const prerequisite = seed.groups.find((g) => g.code === group.dependsOn);
      const found = prerequisite?.options.some(
        (o) => o.code === group.dependsOnOption,
      );
      if (!found) {
        throw new Error(
          `${seed.code}: 선행 옵션 '${group.dependsOn}/${group.dependsOnOption}' 을 찾을 수 없습니다.`,
        );
      }
    }

    const created = await prisma.optionGroup.create({
      data: {
        productId: product.id,
        code: group.code,
        name: group.name,
        required: group.required,
        singleSelect: group.singleSelect,
        selectAll: group.selectAll ?? false,
        noticeOnly: group.noticeOnly ?? false,
        summary: group.summary ?? null,
        detail: group.detail ?? null,
        dependsOnGroupId,
        dependsOnOptionCode: group.dependsOnOption ?? null,
        sortOrder: groupIndex + 1,
        options: {
          create: group.options.map((option, optionIndex) => ({
            code: option.code,
            name: option.name,
            amount: option.amount,
            sortOrder: optionIndex + 1,
            effectiveFrom: EFFECTIVE_FROM,
          })),
        },
      },
    });

    groupIdByCode.set(group.code, created.id);

    // 설명은 금액 버전 테이블이 아닌 별도 행이다. 옵션은 (groupId, code) 로 가리킨다. (ADR-0025)
    for (const option of group.options) {
      if (!option.summary && !option.detail) continue;
      await prisma.optionDescription.create({
        data: {
          groupId: created.id,
          optionCode: option.code,
          summary: option.summary ?? null,
          detail: option.detail ?? null,
        },
      });
    }
  }

  for (const discount of seed.discounts) {
    await prisma.discountRule.create({
      data: {
        productId: product.id,
        code: discount.code,
        name: discount.name,
        type: discount.type,
        amount: discount.amount ?? 0,
        rate: discount.rate ?? "0",
        priority: discount.priority,
        effectiveFrom: EFFECTIVE_FROM,
        conditions: { create: discount.conditions },
      },
    });
  }

  for (const bundle of seed.bundles ?? []) {
    await prisma.optionBundle.create({
      data: {
        productId: product.id,
        groupCode: bundle.groupCode,
        optionCode: bundle.optionCode,
        components: { create: bundle.components },
      },
    });
  }
}

async function main() {
  // 감사 로그는 운영에서 지우지 않는다(.claude/rules/admin.md). 다만 시드는 데이터를 통째로
  // 되돌리므로, 남겨 두면 이미 사라진 행을 가리키는 기록만 남는다. 개발 리셋에서만 지운다.
  await prisma.auditLog.deleteMany();
  await prisma.quoteItem.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.discountCondition.deleteMany();
  await prisma.discountRule.deleteMany();
  await prisma.optionBundleComponent.deleteMany();
  await prisma.optionBundle.deleteMany();
  await prisma.productOption.deleteMany();
  await prisma.optionDescription.deleteMany();
  await prisma.optionGroup.deleteMany();
  await prisma.product.deleteMany();

  for (const [index, seed] of PRODUCTS.entries()) {
    await seedProduct(seed, index + 1);
  }

  const count = await prisma.product.count();
  console.log(`상품 ${count}건을 등록했습니다.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
