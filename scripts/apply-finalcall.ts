/**
 * 올스토리 두 상품에 `대학교 경쟁률 분석(파이널콜)` 을 넣는다. 일회성 운영 데이터 반영이다.
 *
 * 단계와 **다른 그룹**(`FINALCALL`)을 만들고, 선행 조건을 그 그룹의 단계 하나로 좁힌다.
 * 고2는 6단계, 고3은 4단계다. (ADR-0044)
 *
 * 그룹 생성은 Service 에 경로가 없다. 그룹 구조는 상품 설계라서 관리자 화면에서
 * 만들지 않기로 했기 때문이다. (ADR-0023) 그래서 이 스크립트만 Prisma 를 직접 쓴다.
 * 그 안의 옵션은 `createOption` 을 거치므로 감사 로그가 남는다.
 *
 * 시드(prisma/seed.ts)의 같은 값과 짝이다. 새로 만든 DB 는 시드가, 이미 있는 DB 는 이쪽이 채운다.
 *
 * 기본은 미리보기다. 실제로 쓰려면 `--apply` 를 붙인다.
 *   npx tsx scripts/apply-finalcall.ts
 *   npx tsx scripts/apply-finalcall.ts --apply
 */
import { prisma } from "@/lib/prisma";
import {
  createOption,
  saveOptionDescription,
} from "@/services/admin/pricing-admin";

const ACTOR = "admin";
const apply = process.argv.includes("--apply");

const GROUP = {
  code: "FINALCALL",
  name: "경쟁률 분석",
  required: false,
  /** 단계처럼 켜고 끄는 선택 하나다. 다른 선택을 대체하지 않는다. */
  singleSelect: false,
  dependsOnCode: "STAGE",
};

const OPTION = {
  code: "FINALCALL",
  name: "대학교 경쟁률 분석 (파이널콜)",
  amount: 490_000,
  summary:
    "대학교와 학과의 경쟁률을 분석해서 더 유리한 곳으로 추천해주는 프로그램",
};

/** 두 상품의 금액·문구는 같고 선행 단계만 다르다. 수시 6장 최종 지원전략 상담이다. */
const TARGETS = [
  { productCode: "ALLSTORY_G2", dependsOnOptionCode: "STAGE_6" },
  { productCode: "ALLSTORY_G3", dependsOnOptionCode: "STAGE_4" },
];

/** 그룹을 만들고 id 를 돌려준다. 이미 있으면 만들지 않는다. */
async function ensureGroup(
  productId: string,
  dependsOnOptionCode: string,
): Promise<string | null> {
  const existing = await prisma.optionGroup.findFirst({
    where: { productId, code: GROUP.code },
    select: { id: true },
  });
  if (existing) {
    console.log(`  그룹  이미 있다 (변화 없음)`);
    return existing.id;
  }

  const prerequisite = await prisma.optionGroup.findFirstOrThrow({
    where: { productId, code: GROUP.dependsOnCode },
    select: { id: true },
  });

  // 선행 옵션 코드가 틀리면 그룹이 조용히 잠긴 채로 남는다. 해석 실패를 닫힌 쪽으로
  // 처리하기 때문에 화면에 오류가 보이지 않는다. (ADR-0044) 여기서 먼저 확인한다.
  const stage = await prisma.productOption.findFirst({
    where: { groupId: prerequisite.id, code: dependsOnOptionCode },
    orderBy: { effectiveFrom: "desc" },
    select: { name: true },
  });
  if (!stage) {
    throw new Error(
      `선행 옵션이 없다: ${GROUP.dependsOnCode}/${dependsOnOptionCode}`,
    );
  }

  const last = await prisma.optionGroup.findFirst({
    where: { productId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? 0) + 1;

  console.log(
    `  그룹  신설  code=${GROUP.code} 복수선택 선행=${GROUP.dependsOnCode}/${dependsOnOptionCode} (${stage.name}) sort=${sortOrder}`,
  );
  if (!apply) return null;

  const created = await prisma.optionGroup.create({
    data: {
      productId,
      code: GROUP.code,
      name: GROUP.name,
      required: GROUP.required,
      singleSelect: GROUP.singleSelect,
      dependsOnGroupId: prerequisite.id,
      dependsOnOptionCode,
      sortOrder,
    },
    select: { id: true },
  });
  return created.id;
}

async function main() {
  const now = new Date();
  console.log(`\n${apply ? "적용" : "미리보기 (쓰지 않는다)"}`);

  for (const target of TARGETS) {
    const product = await prisma.product.findFirstOrThrow({
      where: { code: target.productCode },
      select: { id: true, name: true },
    });
    console.log(`\n${product.name}`);

    const groupId = await ensureGroup(product.id, target.dependsOnOptionCode);

    const exists = groupId
      ? await prisma.productOption.findFirst({
          where: { groupId, code: OPTION.code },
          select: { id: true },
        })
      : null;

    console.log(
      `  옵션  ${OPTION.code} ${OPTION.name} ${OPTION.amount.toLocaleString("ko-KR")}원 ${exists ? "— 이미 있다 (변화 없음)" : "— 신규 등록"}`,
    );

    if (!apply || exists) continue;

    await createOption(
      {
        productId: product.id,
        groupCode: GROUP.code,
        optionCode: OPTION.code,
        name: OPTION.name,
        amount: OPTION.amount,
        effectiveFrom: null,
      },
      ACTOR,
      now,
    );
    await saveOptionDescription(
      {
        productId: product.id,
        groupCode: GROUP.code,
        optionCode: OPTION.code,
        summary: OPTION.summary,
        detail: null,
      },
      ACTOR,
    );
  }

  if (!apply) console.log("\n--apply 를 붙이면 실제로 씁니다.");
}

main().finally(() => prisma.$disconnect());
