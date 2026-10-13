/**
 * 과정 컨설팅 카탈로그를 확정값으로 맞춘다. 일회성 운영 데이터 반영 스크립트다.
 *
 * 금액·이름은 **새 버전 INSERT** 로 바꾸고(ADR-0002), 설명은 덮어쓴다(ADR-0025).
 * 추가 옵션 그룹(`EXTRA`)을 새로 만든다. (ADR-0027)
 *
 * 그룹 생성은 Service 에 경로가 없다. 그룹 구조는 상품 설계라서 관리자 화면에서
 * 만들지 않기로 했기 때문이다(ADR-0023). 그래서 이 스크립트만 Prisma 를 직접 쓴다.
 * 그 안의 옵션은 `createOption` 을 거치므로 감사 로그가 남는다.
 *
 * 기본은 미리보기다. 실제로 쓰려면 `--apply` 를 붙인다.
 *   npx tsx scripts/apply-course-catalog.ts
 *   npx tsx scripts/apply-course-catalog.ts --apply
 */
import { prisma } from "@/lib/prisma";
import {
  createOption,
  getPricingAdminView,
  saveOptionDescription,
  saveOptionVersion,
} from "@/services/admin/pricing-admin";

const ACTOR = "admin";
const apply = process.argv.includes("--apply");

/** 3회차·6회차가 같은 안내문을 쓴다. 받는 상담이 같고 횟수만 다르다. */
const SESSION_SUMMARY =
  "내신 성적 수준, 대학교 수준, 대학교 지원 어디까지 가능한지? 소개 및 생활기록부 수준, 전공적합성 코칭, 지원 대학 수준 학생부 종합전형 원리 코칭";

/** 5건·10건이 같은 안내문을 쓴다. 건수만 다르다. */
const ASSIGNMENT_SUMMARY =
  "기간은 고3 7월까지 / 창체활동 수행평가 가능 (채점기준표가 제시된 수행평가는 진행되지 않습니다.)";

interface Target {
  groupCode: string;
  code: string;
  name: string;
  amount: number;
  summary: string | null;
}

/** 소요 시간·이용 기간은 이름 안에 있다. 이름이 견적 스냅샷에 남는다. (ADR-0026) */
const CATALOG: Target[] = [
  {
    groupCode: "SESSIONS",
    code: "S3",
    name: "3회차 (1회당 60~80분)",
    amount: 580_000,
    summary: SESSION_SUMMARY,
  },
  {
    groupCode: "SESSIONS",
    code: "S6",
    name: "6회차 (1회당 60~80분)",
    amount: 1_100_000,
    summary: SESSION_SUMMARY,
  },
  {
    groupCode: "CHANNEL",
    code: "KAKAO",
    name: "카톡 소통 (6개월)",
    amount: 390_000,
    summary:
      "전용 카카오톡 상담방 개설, 회차 사이에도 질문·자료 전달 가능, 6개월 이용",
  },
  {
    groupCode: "CHANNEL",
    code: "EMAIL",
    name: "이메일 소통 (1년)",
    amount: 99_000,
    summary: "네이버 이메일로 자료·질문 전달, 회차 사이에도 상담 가능, 1년 이용",
  },
  {
    groupCode: "ASSIGNMENT",
    code: "A5",
    name: "5건",
    amount: 250_000,
    summary: ASSIGNMENT_SUMMARY,
  },
  {
    groupCode: "ASSIGNMENT",
    code: "A10",
    name: "10건",
    amount: 450_000,
    summary: ASSIGNMENT_SUMMARY,
  },
];

const EXTRA_GROUP = {
  code: "EXTRA",
  name: "추가 옵션",
  required: false,
  /** 복수 선택이다. 추가 옵션은 다른 선택을 대체하지 않는다. (ADR-0027) */
  singleSelect: false,
  /** 회차를 고른 뒤에만 고를 수 있다. (ADR-0010) */
  dependsOnCode: "SESSIONS",
};

const EXTRA_OPTION = {
  code: "MOCK",
  name: "모의고사 성적 분석 (30분)",
  amount: 59_000,
  summary:
    "대학교 수준, 대학교 지원 어디까지 가능한지, 국영수 학업 방향성(고3 6, 9월 제외) 고1, 2까지는 분석 가능",
};

/** 그룹을 만들고 id 를 돌려준다. 이미 있으면 만들지 않는다. */
async function ensureExtraGroup(productId: string): Promise<string | null> {
  const existing = await prisma.optionGroup.findFirst({
    where: { productId, code: EXTRA_GROUP.code },
    select: { id: true },
  });
  if (existing) {
    console.log(`\n추가 옵션 그룹  이미 있다 (변화 없음)`);
    return existing.id;
  }

  const prerequisite = await prisma.optionGroup.findFirstOrThrow({
    where: { productId, code: EXTRA_GROUP.dependsOnCode },
    select: { id: true, sortOrder: true },
  });
  const last = await prisma.optionGroup.findFirst({
    where: { productId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? 0) + 1;

  console.log(
    `\n추가 옵션 그룹  신설  code=${EXTRA_GROUP.code} 복수선택 선행=${EXTRA_GROUP.dependsOnCode} sort=${sortOrder}`,
  );
  if (!apply) return null;

  const created = await prisma.optionGroup.create({
    data: {
      productId,
      code: EXTRA_GROUP.code,
      name: EXTRA_GROUP.name,
      required: EXTRA_GROUP.required,
      singleSelect: EXTRA_GROUP.singleSelect,
      dependsOnGroupId: prerequisite.id,
      sortOrder,
    },
    select: { id: true },
  });
  return created.id;
}

async function main() {
  const now = new Date();
  const products = await getPricingAdminView(now);
  const product = products.find((p) => p.code === "COURSE");
  if (!product) throw new Error("COURSE 상품이 없다");

  console.log(`\n${apply ? "적용" : "미리보기 (쓰지 않는다)"}\n`);

  for (const target of CATALOG) {
    const current = product.options.find(
      (o) => o.groupCode === target.groupCode && o.code === target.code,
    );
    if (!current) throw new Error(`옵션이 없다: ${target.groupCode}/${target.code}`);

    const nameChanged = current.name !== target.name;
    const amountChanged = current.amount !== target.amount;
    const summaryChanged = (current.summary ?? null) !== target.summary;

    console.log(`${target.groupCode}/${target.code}`);
    console.log(
      `  이름 ${current.name} → ${target.name}${nameChanged ? "" : "  (변화 없음)"}`,
    );
    console.log(
      `  금액 ${current.amount.toLocaleString("ko-KR")} → ${target.amount.toLocaleString("ko-KR")}${amountChanged ? "" : "  (변화 없음)"}`,
    );
    console.log(
      `  설명 ${JSON.stringify(current.summary)} → ${JSON.stringify(target.summary)}${summaryChanged ? "" : "  (변화 없음)"}`,
    );

    if (!apply) continue;

    if (nameChanged || amountChanged) {
      await saveOptionVersion(
        {
          productId: product.id,
          groupCode: target.groupCode,
          optionCode: target.code,
          name: target.name,
          amount: target.amount,
          effectiveFrom: null,
        },
        ACTOR,
        now,
      );
    }
    if (summaryChanged) {
      await saveOptionDescription(
        {
          productId: product.id,
          groupCode: target.groupCode,
          optionCode: target.code,
          summary: target.summary,
          detail: null,
        },
        ACTOR,
      );
    }
  }

  const groupId = await ensureExtraGroup(product.id);

  const extraExists = groupId
    ? await prisma.productOption.findFirst({
        where: { groupId, code: EXTRA_OPTION.code },
        select: { id: true },
      })
    : null;

  console.log(
    `  옵션 ${EXTRA_OPTION.code} ${EXTRA_OPTION.name} ${EXTRA_OPTION.amount.toLocaleString("ko-KR")}원 ${extraExists ? "— 이미 있다 (변화 없음)" : "— 신규 등록"}`,
  );

  if (apply && !extraExists) {
    await createOption(
      {
        productId: product.id,
        groupCode: EXTRA_GROUP.code,
        optionCode: EXTRA_OPTION.code,
        name: EXTRA_OPTION.name,
        amount: EXTRA_OPTION.amount,
        effectiveFrom: null,
      },
      ACTOR,
      now,
    );
    await saveOptionDescription(
      {
        productId: product.id,
        groupCode: EXTRA_GROUP.code,
        optionCode: EXTRA_OPTION.code,
        summary: EXTRA_OPTION.summary,
        detail: null,
      },
      ACTOR,
    );
  }

  if (!apply) console.log("\n--apply 를 붙이면 실제로 씁니다.");
}

main().finally(() => prisma.$disconnect());
