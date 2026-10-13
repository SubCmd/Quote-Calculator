/**
 * 올스토리 카탈로그를 확정값으로 맞춘다. 일회성 운영 데이터 반영 스크립트다.
 * (ADR-0028, ADR-0029, ADR-0030, ADR-0031)
 *
 * 고2는 여섯 단계 전부, 고3은 **뒤 네 단계**를 쓴다. 같은 상담이라 문구가
 * 한 곳(`STAGE_TEXT`)에 있고, 단계 번호는 상품 안에서 1부터 다시 붙는다. (ADR-0029)
 * **금액은 공유하지 않는다.** 고3 4단계 590,000원이 같은 상담인 고2 6단계 490,000원과
 * 달라서 상품별 배열로 둔다. (ADR-0030)
 *
 * 금액·이름은 **새 버전 INSERT** 로 바꾸고(ADR-0002), 설명은 덮어쓴다(ADR-0025).
 * 이름은 `1단계 (60~80분)` 까지이고 상담 제목은 `summary` 로 내려간다. (ADR-0031)
 * 그래서 이 스크립트는 열 단계 전부에 **새 이름 버전**을 넣고 `summary` 를 채운다.
 * 전단계 할인은 두 상품 모두 `RATE 10%` → 정액으로 새 버전을 넣는다.
 * 고2는 45,000원(통합등록 1,490,000), 고3은 37,000원(통합등록 1,150,000)이다.
 *
 * 할인 **종류** 변경은 Service 에 경로가 없다. `addDiscountVersion` 은 종류를 이전 버전에서
 * 그대로 복사한다. 종류는 어느 입력 칸이 뜻을 갖는지를 정하는 값이라 금액 운영이 아니라
 * 상품 설계에 가깝고, 관리자 화면에 경로를 두지 않기로 했다(ADR-0028). 그래서 그 한 건만
 * 이 스크립트가 Prisma 를 직접 쓴다. 감사 로그는 같은 트랜잭션에서 함께 남긴다.
 *
 * 기본은 미리보기다. 실제로 쓰려면 `--apply` 를 붙인다.
 *   npx tsx scripts/apply-allstory-catalog.ts
 *   npx tsx scripts/apply-allstory-catalog.ts --apply
 */
import { prisma } from "@/lib/prisma";
import {
  getPricingAdminView,
  saveOptionDescription,
  saveOptionVersion,
} from "@/services/admin/pricing-admin";

const ACTOR = "admin";
const GROUP_CODE = "STAGE";
const DISCOUNT_CODE = "ALL_STAGES";
const apply = process.argv.includes("--apply");

interface StageText {
  /** 이름의 괄호 안. 소요 시간과 금액의 한정이 들어간다. 견적 스냅샷에 남는다. */
  qualifier: string;
  /** 상담 제목. 이름 아래 항상 보이는 한 줄이다. (ADR-0025, ADR-0031) */
  summary: string;
  /** 펼치기(`<details>`) 안에 들어가는 한 문단. */
  detail: string;
}

/**
 * 이름에는 단계 번호와 괄호 한정만 남는다. 상담 제목은 `summary` 다. (ADR-0031)
 * 2단계의 `첨삭 제외` 는 금액의 한정이라 설명이 아니라 이름에 둔다. (ADR-0028)
 * 금액은 여기 없다. 같은 상담이어도 상품마다 달라서 `TARGETS` 에 있다. (ADR-0030)
 */
const STAGE_TEXT: StageText[] = [
  {
    qualifier: "60~80분",
    summary: "고2 생기부 방향성 컨설팅",
    detail:
      "내신 성적과 기존 생기부를 분석해 희망 대학·학과에 필요한 역량을 점검하고, 학생의 강점과 관심 분야를 반영한 과목별 탐구 주제 및 활동 방향을 설정함.",
  },
  {
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

interface Target {
  productCode: string;
  text: StageText[];
  /** 단계 금액. 단계 수는 이 배열의 길이가 정한다. (ADR-0030) */
  amounts: number[];
  /** 통합등록 금액. 단계 합에서 이 값을 빼면 정액 할인액이다. */
  bundleTotal: number;
}

const TARGETS: Target[] = [
  {
    productCode: "ALLSTORY_G2",
    text: STAGE_TEXT,
    amounts: [199_000, 249_000, 199_000, 149_000, 249_000, 490_000],
    bundleTotal: 1_490_000,
  },
  // 고3은 고2의 뒤 네 단계다. 4단계만 금액이 다르다. (ADR-0029, ADR-0030)
  {
    productCode: "ALLSTORY_G3",
    text: STAGE_TEXT.slice(2),
    amounts: [199_000, 149_000, 249_000, 590_000],
    bundleTotal: 1_150_000,
  },
];

/** 단계 번호는 그 상품 안에서 1부터 붙는다. `code` 도 그 번호를 따른다. (ADR-0029) */
function numbered(text: StageText[], amounts: number[]) {
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

const won = (n: number) => n.toLocaleString("ko-KR");

/** 전단계 할인을 정액으로 바꾼다. 종류가 바뀌므로 Service 경로가 없다. */
async function switchDiscountToFixed(
  productId: string,
  bundleTotal: number,
  stageSum: number,
  now: Date,
) {
  const bundleDiscount = stageSum - bundleTotal;
  const current = await prisma.discountRule.findFirst({
    where: { productId, code: DISCOUNT_CODE, isActive: true },
    orderBy: { effectiveFrom: "desc" },
    include: { conditions: true },
  });
  if (!current) throw new Error(`할인 규칙이 없다: ${DISCOUNT_CODE}`);

  const beforeRate = current.rate.toFixed(4);
  const before =
    current.type === "RATE"
      ? `${(Number(beforeRate) * 100).toFixed(2)}%`
      : `${won(current.amount)}원 정액`;
  const after = `${won(bundleDiscount)}원 정액`;
  const changed = current.type !== "FIXED" || current.amount !== bundleDiscount;

  console.log(`\n${current.name}  (${DISCOUNT_CODE})`);
  console.log(`  조건 ${current.conditions.length}개 — 그대로 복사한다`);
  console.log(`  할인 ${before} → ${after}${changed ? "" : "  (변화 없음)"}`);
  console.log(
    `  단계 합 ${won(stageSum)} - 통합등록 ${won(bundleTotal)} = ${won(bundleDiscount)}`,
  );

  if (!apply || !changed) return;

  await prisma.$transaction([
    prisma.discountRule.create({
      data: {
        productId: current.productId,
        code: current.code,
        name: current.name,
        type: "FIXED",
        amount: bundleDiscount,
        rate: "0.0000",
        priority: current.priority,
        effectiveFrom: now,
        createdBy: ACTOR,
        conditions: {
          create: current.conditions.map((c) => ({
            groupCode: c.groupCode,
            optionCode: c.optionCode,
          })),
        },
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "DISCOUNT_VERSION_ADDED",
        actor: ACTOR,
        summary: `${current.name} ${before} → ${after} (통합등록 ${won(bundleTotal)}원)`,
        targetType: "DiscountRule",
        targetId: DISCOUNT_CODE,
        beforeValue: {
          type: current.type,
          amount: current.amount,
          rate: beforeRate,
          priority: current.priority,
          effectiveFrom: current.effectiveFrom.toISOString(),
        },
        afterValue: {
          type: "FIXED",
          amount: bundleDiscount,
          rate: "0.0000",
          priority: current.priority,
          effectiveFrom: now.toISOString(),
        },
      },
    }),
  ]);
}

async function main() {
  const now = new Date();
  const products = await getPricingAdminView(now);

  console.log(`\n${apply ? "적용" : "미리보기 (쓰지 않는다)"}`);

  for (const target of TARGETS) {
    const product = products.find((p) => p.code === target.productCode);
    if (!product) throw new Error(`${target.productCode} 상품이 없다`);

    const stages = numbered(target.text, target.amounts);
    const stageSum = stages.reduce((sum, s) => sum + s.amount, 0);

    console.log(`\n=== ${product.name} (${target.productCode}) ===`);

    for (const stage of stages) {
      const current = product.options.find(
        (o) => o.groupCode === GROUP_CODE && o.code === stage.code,
      );
      if (!current) throw new Error(`옵션이 없다: ${GROUP_CODE}/${stage.code}`);

      const nameChanged = current.name !== stage.name;
      const amountChanged = current.amount !== stage.amount;
      const descriptionChanged =
        (current.summary ?? null) !== stage.summary ||
        (current.detail ?? null) !== stage.detail;

      console.log(`${GROUP_CODE}/${stage.code}`);
      console.log(
        `  이름 ${current.name} → ${stage.name}${nameChanged ? "" : "  (변화 없음)"}`,
      );
      console.log(
        `  금액 ${won(current.amount)} → ${won(stage.amount)}${amountChanged ? "" : "  (변화 없음)"}`,
      );
      console.log(
        `  한 줄 ${JSON.stringify(current.summary)} → ${JSON.stringify(stage.summary)}${(current.summary ?? null) === stage.summary ? "  (변화 없음)" : ""}`,
      );
      console.log(
        `  펼치기 ${JSON.stringify(current.detail)} → ${JSON.stringify(stage.detail)}${(current.detail ?? null) === stage.detail ? "  (변화 없음)" : ""}`,
      );

      if (!apply) continue;

      if (nameChanged || amountChanged) {
        await saveOptionVersion(
          {
            productId: product.id,
            groupCode: GROUP_CODE,
            optionCode: stage.code,
            name: stage.name,
            amount: stage.amount,
            effectiveFrom: null,
          },
          ACTOR,
          now,
        );
      }
      if (descriptionChanged) {
        await saveOptionDescription(
          {
            productId: product.id,
            groupCode: GROUP_CODE,
            optionCode: stage.code,
            summary: stage.summary,
            detail: stage.detail,
          },
          ACTOR,
        );
      }
    }

    console.log(`  단계 합 ${won(stageSum)}`);

    await switchDiscountToFixed(product.id, target.bundleTotal, stageSum, now);
  }

  if (!apply) console.log("\n--apply 를 붙이면 실제로 씁니다.");
}

main().finally(() => prisma.$disconnect());
