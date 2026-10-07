import { PrismaClient } from "@prisma/client";

/**
 * 입시 컨설팅 상품 4종. (docs/requirements.md 3절)
 *
 * 금액은 모두 부가세 포함, 원 단위 정수다.
 * 확정값은 카톡 소통 300,000 과 이메일 소통 100,000 뿐이다.
 * 그 외 금액과 할인율은 임시값이다. (docs/requirements.md Q-9)
 * 교체할 때 이 파일의 숫자만 고치면 된다. 코드 수정은 필요하지 않다.
 */
const prisma = new PrismaClient();

const EFFECTIVE_FROM = new Date("2026-01-01T00:00:00.000Z");

type OptionSeed = { code: string; name: string; amount: number };

type GroupSeed = {
  code: string;
  name: string;
  required: boolean;
  singleSelect: boolean;
  /// 이 그룹을 고르기 전에 선택이 있어야 하는 그룹의 코드 (ADR-0010)
  dependsOn?: string;
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

type ProductSeed = {
  code: string;
  name: string;
  groups: GroupSeed[];
  discounts: DiscountSeed[];
};

/** 올스토리 단계 옵션. 단계 수와 단계당 금액만 다르다. */
function stageOptions(count: number, amount: number): OptionSeed[] {
  return Array.from({ length: count }, (_, i) => ({
    code: `STAGE_${i + 1}`,
    name: `${i + 1}단계`,
    amount,
  }));
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
          { code: "NAESIN", name: "내신 성적 분석", amount: 150_000 },
          { code: "MOCK", name: "모의고사 성적 분석", amount: 150_000 },
          { code: "RECORD", name: "생활기록부 분석", amount: 200_000 },
        ],
      },
    ],
    discounts: [
      {
        code: "BUNDLE_ALL",
        name: "통합 할인 (분석 3개)",
        type: "RATE",
        rate: "0.1500",
        priority: 10,
        conditions: [
          { groupCode: "ANALYSIS", optionCode: "NAESIN" },
          { groupCode: "ANALYSIS", optionCode: "MOCK" },
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
          { code: "S3", name: "3회차", amount: 600_000 },
          { code: "S6", name: "6회차", amount: 1_100_000 },
        ],
      },
      {
        code: "CHANNEL",
        name: "소통 방식",
        required: false,
        singleSelect: true,
        dependsOn: "SESSIONS",
        options: [
          { code: "KAKAO", name: "카톡 소통", amount: 300_000 },
          { code: "EMAIL", name: "이메일 소통", amount: 100_000 },
        ],
      },
      {
        code: "ASSIGNMENT",
        name: "수행평가 자료 요청",
        required: false,
        singleSelect: true,
        dependsOn: "SESSIONS",
        options: [
          { code: "A5", name: "5건", amount: 250_000 },
          { code: "A10", name: "10건", amount: 450_000 },
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
        options: stageOptions(6, 200_000),
      },
    ],
    discounts: [
      {
        code: "ALL_STAGES",
        name: "전단계 할인",
        type: "RATE",
        rate: "0.1000",
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
        options: stageOptions(4, 250_000),
      },
    ],
    discounts: [
      {
        code: "ALL_STAGES",
        name: "전단계 할인",
        type: "RATE",
        rate: "0.1000",
        priority: 10,
        conditions: allStagesCondition(4),
      },
    ],
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

    const created = await prisma.optionGroup.create({
      data: {
        productId: product.id,
        code: group.code,
        name: group.name,
        required: group.required,
        singleSelect: group.singleSelect,
        dependsOnGroupId,
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
}

async function main() {
  // 감사 로그는 운영에서 지우지 않는다(.claude/rules/admin.md). 다만 시드는 데이터를 통째로
  // 되돌리므로, 남겨 두면 이미 사라진 행을 가리키는 기록만 남는다. 개발 리셋에서만 지운다.
  await prisma.auditLog.deleteMany();
  await prisma.quoteItem.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.discountCondition.deleteMany();
  await prisma.discountRule.deleteMany();
  await prisma.productOption.deleteMany();
  await prisma.optionGroup.deleteMany();
  await prisma.product.deleteMany();

  for (const [index, seed] of PRODUCTS.entries()) {
    await seedProduct(seed, index + 1);
  }

  const count = await prisma.product.count();
  console.log(
    `상품 ${count}건을 등록했습니다. 금액 대부분은 임시값입니다 (requirements.md Q-9).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
