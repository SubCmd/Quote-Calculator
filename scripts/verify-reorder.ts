/**
 * ADR-0026 표시 순서 수동 검증. 바꾼 뒤 **원래 순서로 되돌린다.**
 * 순서는 덮어쓰기라서 되돌리기가 손실 없이 가능하다. 감사 로그에는 두 줄이 남는다.
 *
 *   npx tsx scripts/verify-reorder.ts
 */
import { prisma } from "@/lib/prisma";
import { findPricingAdminView } from "@/repositories/pricing-admin";
import {
  reorderGroups,
  reorderOptions,
  reorderProducts,
} from "@/repositories/pricing-order";

const ACTOR = "verify";
let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n      기대 ${JSON.stringify(expected)}\n      실제 ${JSON.stringify(actual)}`}`,
  );
}

async function expectThrow(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    failures += 1;
    console.log(`FAIL  ${label} (예외가 나지 않았다)`);
  } catch (error) {
    console.log(`PASS  ${label} — ${(error as Error).message}`);
  }
}

async function productCodes(): Promise<string[]> {
  const rows = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { code: true },
  });
  return rows.map((r) => r.code);
}

async function optionCodes(productCode: string, groupCode: string) {
  const products = await findPricingAdminView(new Date());
  const product = products.find((p) => p.code === productCode)!;
  return [
    ...product.options.filter((o) => o.groupCode === groupCode),
    ...product.inactiveOptions.filter((o) => o.groupCode === groupCode),
  ]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((o) => o.code);
}

/** 모든 버전 행이 같은 sortOrder 를 갖는지. 한 행만 고치면 적용 시각 전후로 순서가 바뀐다. */
async function sortOrdersByCode(groupCode: string, productCode: string) {
  const rows = await prisma.productOption.findMany({
    where: { group: { code: groupCode, product: { code: productCode } } },
    select: { code: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  const byCode = new Map<string, Set<number>>();
  for (const row of rows) {
    if (!byCode.has(row.code)) byCode.set(row.code, new Set());
    byCode.get(row.code)!.add(row.sortOrder);
  }
  return [...byCode].map(([code, orders]) => [code, [...orders]] as const);
}

async function main() {
  // --- 1. 옵션 순서 (버전이 여러 개인 1회성 컨설팅으로 본다) ---
  const before = await optionCodes("ONESHOT", "ANALYSIS");
  console.log(`\n옵션 현재 순서 ${before.join(" > ")}`);

  const products = await findPricingAdminView(new Date());
  const oneshot = products.find((p) => p.code === "ONESHOT")!;

  check(
    "같은 순서를 보내면 changed 가 false 다",
    (
      await reorderOptions(
        { productId: oneshot.id, groupCode: "ANALYSIS", optionCodes: before },
        ACTOR,
      )
    ).changed,
    false,
  );

  const swapped = [before[1]!, before[0]!, ...before.slice(2)];
  check(
    "두 항목을 바꾸면 changed 가 true 다",
    (
      await reorderOptions(
        { productId: oneshot.id, groupCode: "ANALYSIS", optionCodes: swapped },
        ACTOR,
      )
    ).changed,
    true,
  );
  check("바뀐 순서가 조회에 반영된다", await optionCodes("ONESHOT", "ANALYSIS"), swapped);
  check(
    "모든 버전 행이 같은 sortOrder 를 갖는다",
    (await sortOrdersByCode("ANALYSIS", "ONESHOT")).map(([, o]) => o.length),
    before.map(() => 1),
  );

  await expectThrow("빠진 항목이 있으면 거부한다", () =>
    reorderOptions(
      {
        productId: oneshot.id,
        groupCode: "ANALYSIS",
        optionCodes: swapped.slice(1),
      },
      ACTOR,
    ),
  );
  await expectThrow("바깥 항목이 들어오면 거부한다", () =>
    reorderOptions(
      {
        productId: oneshot.id,
        groupCode: "ANALYSIS",
        optionCodes: [...swapped.slice(1), "STAGE_1"],
      },
      ACTOR,
    ),
  );

  await reorderOptions(
    { productId: oneshot.id, groupCode: "ANALYSIS", optionCodes: before },
    ACTOR,
  );
  check("원래 순서로 되돌린다", await optionCodes("ONESHOT", "ANALYSIS"), before);

  // --- 2. 상품 탭 순서 ---
  const tabsBefore = await productCodes();
  console.log(`\n상품 탭 현재 순서 ${tabsBefore.join(" > ")}`);
  const tabsSwapped = [tabsBefore[1]!, tabsBefore[0]!, ...tabsBefore.slice(2)];
  await reorderProducts(tabsSwapped, ACTOR);
  check("탭 순서가 바뀐다", await productCodes(), tabsSwapped);
  await reorderProducts(tabsBefore, ACTOR);
  check("탭 순서를 되돌린다", await productCodes(), tabsBefore);

  // --- 3. 단계(그룹) 순서. 그룹이 2개 이상인 상품으로 본다 ---
  const multi = products.find((p) => p.groups.length > 1);
  if (!multi) {
    console.log("\n그룹이 2개 이상인 상품이 없어 단계 순서는 건너뛴다");
  } else {
    const groupsBefore = multi.groups.map((g) => g.code);
    console.log(`\n${multi.code} 단계 현재 순서 ${groupsBefore.join(" > ")}`);
    const groupsSwapped = [
      groupsBefore[1]!,
      groupsBefore[0]!,
      ...groupsBefore.slice(2),
    ];
    // 선행 그룹보다 위로 올리는 배치는 막는다. (ADR-0010)
    const dependent = await prisma.optionGroup.findFirst({
      where: { productId: multi.id, dependsOnGroupId: { not: null } },
      select: { code: true },
    });
    if (dependent)
      await expectThrow("선행 그룹보다 위에 두면 거부한다", () =>
        reorderGroups(
          {
            productId: multi.id,
            groupCodes: [
              dependent.code,
              ...groupsBefore.filter((c) => c !== dependent.code),
            ],
          },
          ACTOR,
        ),
      );

    // 선행 관계를 깨지 않는 자리바꿈. 선행 그룹이 맨 앞이므로 뒤쪽 둘을 맞바꾼다.
    const legal = [
      ...groupsBefore.slice(0, -2),
      groupsBefore.at(-1)!,
      groupsBefore.at(-2)!,
    ];
    await reorderGroups({ productId: multi.id, groupCodes: legal }, ACTOR);
    const after = (await findPricingAdminView(new Date())).find(
      (p) => p.code === multi.code,
    )!;
    check("단계 순서가 바뀐다", after.groups.map((g) => g.code), legal);

    await reorderGroups(
      { productId: multi.id, groupCodes: groupsBefore },
      ACTOR,
    );
    const restored = (await findPricingAdminView(new Date())).find(
      (p) => p.code === multi.code,
    )!;
    check("단계 순서를 되돌린다", restored.groups.map((g) => g.code), groupsBefore);
  }

  const log = await prisma.auditLog.findMany({
    where: { action: "DISPLAY_ORDER_CHANGED", actor: ACTOR },
    orderBy: { createdAt: "asc" },
    select: { summary: true },
  });
  console.log("\n감사 로그");
  for (const entry of log) console.log(`  ${entry.summary}`);

  console.log(failures === 0 ? "\n전부 통과" : `\n실패 ${failures}건`);
  if (failures > 0) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
