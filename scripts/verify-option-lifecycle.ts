/**
 * ADR-0023 옵션 생애주기 수동 검증. 테스트 DB 전용 일회성 스크립트다.
 * 실제 DB 를 쓰므로 Vitest 스위트에 넣지 않는다. (`.claude/rules/testing.md`)
 * 운영 DB 로 실행하면 지울 수 없는 행이 남는다. DATABASE_URL 을 반드시 확인하고 쓴다.
 *
 * 빈 테스트 DB 를 만든 뒤:
 *   DATABASE_URL=".../quote_calculator_test?schema=public" npx prisma migrate deploy
 *   DATABASE_URL=".../quote_calculator_test?schema=public" npx tsx prisma/seed.ts
 *   DATABASE_URL=".../quote_calculator_test?schema=public" npx tsx scripts/verify-option-lifecycle.ts
 * 시드 직후 상태를 전제로 하므로 두 번 돌리려면 DB 를 다시 만든다.
 */
import { prisma } from "@/lib/prisma";
import {
  createOption,
  deactivateOption,
  addOptionVersion,
  findPricingAdminView,
  reactivateOption,
} from "@/repositories/pricing-admin";
import { findRuleSet } from "@/repositories/pricing-rule";
import { estimate } from "@/services/pricing/estimate";

const ACTOR = "verify";
const now = new Date("2026-10-08T00:00:00Z");
const later = new Date("2026-10-09T00:00:00Z");

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

async function view(at: Date = later) {
  const products = await findPricingAdminView(at);
  const product = products.find((p) => p.code === "ONESHOT")!;
  return product;
}

async function main() {
  if (!process.env.DATABASE_URL?.includes("quote_calculator_test")) {
    throw new Error("테스트 DB 가 아니다. DATABASE_URL 을 확인하라.");
  }

  const product = await view();
  const productId = product.id;
  console.log(`\n대상 상품: ${product.name} (${productId})\n`);

  // --- 1. 신규 옵션 ---
  await createOption(
    {
      productId,
      groupCode: "ANALYSIS",
      optionCode: "ESSAY",
      name: "자기소개서 분석",
      amount: 180_000,
      effectiveFrom: now,
    },
    ACTOR,
  );
  const afterCreate = await view();
  const essay = afterCreate.options.find((o) => o.code === "ESSAY");
  check("신규 옵션이 활성 목록에 보인다", essay?.name, "자기소개서 분석");
  check("금액이 입력대로 저장된다", essay?.amount, 180_000);
  check("sortOrder 는 그룹 최댓값 + 1 이다", afterCreate.options.at(-1)?.code, "ESSAY");

  await expectThrow("같은 코드는 거부한다", () =>
    createOption(
      {
        productId,
        groupCode: "ANALYSIS",
        optionCode: "ESSAY",
        name: "중복",
        amount: 1000,
        effectiveFrom: now,
      },
      ACTOR,
    ),
  );

  // --- 2. 이름 수정 (새 버전) ---
  await expectThrow("같은 적용 시작 시각의 버전은 거부한다", () =>
    addOptionVersion(
      {
        productId,
        groupCode: "ANALYSIS",
        optionCode: "ESSAY",
        name: "자소서 분석",
        amount: 180_000,
        effectiveFrom: now,
      },
      ACTOR,
    ),
  );

  await addOptionVersion(
    {
      productId,
      groupCode: "ANALYSIS",
      optionCode: "ESSAY",
      name: "자소서 분석",
      amount: 180_000,
      effectiveFrom: later,
    },
    ACTOR,
  );
  const afterRename = await view();
  const renamed = afterRename.options.find((o) => o.code === "ESSAY");
  check("이름만 바꾼 새 버전이 적용된다", renamed?.name, "자소서 분석");
  check("버전이 2개로 쌓인다", renamed?.versionCount, 2);
  check("금액은 그대로다", renamed?.amount, 180_000);

  // --- 3. 조건 옵션 비활성화 → 할인도 함께 꺼진다 ---
  const deactivated = await deactivateOption(
    { productId, groupCode: "ANALYSIS", optionCode: "RECORD" },
    ACTOR,
  );
  check(
    "RECORD 를 끄면 BUNDLE_ALL 도 꺼진다",
    deactivated.deactivatedDiscounts.map((d) => d.code),
    ["BUNDLE_ALL"],
  );

  const afterDeactivate = await view();
  check(
    "꺼진 옵션 목록에 RECORD 가 보인다",
    afterDeactivate.inactiveOptions.map((o) => o.code),
    ["RECORD"],
  );
  check(
    "활성 목록에서는 사라진다",
    afterDeactivate.options.some((o) => o.code === "RECORD"),
    false,
  );
  check(
    "되살리면 BUNDLE_ALL 이 함께 켜진다고 안내한다",
    afterDeactivate.inactiveOptions[0]?.reactivatableDiscounts.map((d) => d.code),
    ["BUNDLE_ALL"],
  );
  check(
    "보류될 할인은 없다",
    afterDeactivate.inactiveOptions[0]?.blockedDiscounts,
    [],
  );

  // 꺼진 옵션에 금액 버전을 추가해 조용히 되살리는 경로가 막혀 있는지
  await expectThrow("꺼진 옵션에는 버전을 추가할 수 없다", () =>
    addOptionVersion(
      {
        productId,
        groupCode: "ANALYSIS",
        optionCode: "RECORD",
        name: "생활기록부 분석",
        amount: 999_000,
        effectiveFrom: now,
      },
      ACTOR,
    ),
  );

  // 조건 옵션이 꺼진 상태에서도 계산이 터지지 않는지 (할인이 함께 꺼졌으므로)
  const stillWorks = await estimate(
    {
      productId,
      optionIds: afterDeactivate.options
        .filter((o) => o.code === "NAESIN" || o.code === "MOCK")
        .map((o) => o.versionId),
    },
    later,
  );
  check("옵션이 꺼진 뒤에도 계산이 된다", stillWorks.ok, true);
  check(
    "할인이 꺼졌으므로 총액은 소계와 같다",
    stillWorks.ok && stillWorks.totalAmount,
    300_000,
  );

  // --- 4. 두 번째 조건 옵션도 끈 뒤 하나만 되살리면 할인은 보류된다 ---
  await deactivateOption(
    { productId, groupCode: "ANALYSIS", optionCode: "MOCK" },
    ACTOR,
  );
  const twoOff = await view();
  const recordRow = twoOff.inactiveOptions.find((o) => o.code === "RECORD")!;
  check(
    "MOCK 이 꺼진 동안 RECORD 재활성화는 할인을 보류한다",
    recordRow.reactivatableDiscounts,
    [],
  );
  check(
    "보류 사유로 빠진 옵션 이름을 적는다",
    recordRow.blockedDiscounts.map((d) => ({ code: d.code, missing: d.missing })),
    [{ code: "BUNDLE_ALL", missing: ["모의고사 성적 분석"] }],
  );

  const partial = await reactivateOption(
    { productId, groupCode: "ANALYSIS", optionCode: "RECORD" },
    ACTOR,
  );
  check("RECORD 만 되살리면 할인은 켜지지 않는다", partial.reactivatedDiscounts, []);
  check(
    "보류된 할인을 사유와 함께 돌려준다",
    partial.blockedDiscounts.map((d) => d.code),
    ["BUNDLE_ALL"],
  );

  const afterPartial = await view();
  check(
    "RECORD 는 활성으로 돌아온다",
    afterPartial.options.some((o) => o.code === "RECORD"),
    true,
  );
  check(
    "BUNDLE_ALL 은 아직 꺼져 있다",
    afterPartial.discounts.some((d) => d.code === "BUNDLE_ALL"),
    false,
  );

  const ruleSet = await findRuleSet(productId, later);
  check("조건이 깨지지 않아 규칙 조회가 성공한다", ruleSet !== null, true);

  // --- 5. 마지막 조건 옵션까지 되살리면 할인이 돌아온다 ---
  const full = await reactivateOption(
    { productId, groupCode: "ANALYSIS", optionCode: "MOCK" },
    ACTOR,
  );
  check(
    "MOCK 까지 되살리면 BUNDLE_ALL 이 함께 켜진다",
    full.reactivatedDiscounts.map((d) => d.code),
    ["BUNDLE_ALL"],
  );

  const restored = await view();
  check("꺼진 옵션이 하나도 남지 않는다", restored.inactiveOptions, []);
  check(
    "BUNDLE_ALL 이 활성 목록으로 돌아온다",
    restored.discounts.some((d) => d.code === "BUNDLE_ALL"),
    true,
  );
  check(
    "모든 버전이 켜졌는지 (MOCK 버전 수)",
    restored.options.find((o) => o.code === "MOCK")?.versionCount,
    1,
  );

  // 할인이 실제로 다시 걸리는지
  const discounted = await estimate(
    {
      productId,
      optionIds: restored.options
        .filter((o) => ["NAESIN", "MOCK", "RECORD"].includes(o.code))
        .map((o) => o.versionId),
    },
    later,
  );
  // 계산 결과의 appliedDiscount 는 코드가 아니라 이름을 들고 온다 (DiscountCandidate).
  check(
    "분석 3개를 고르면 15% 할인이 다시 걸린다",
    discounted.ok && discounted.appliedDiscount?.name,
    "통합 할인 (분석 3개)",
  );
  check(
    "총액 500,000 - 75,000 = 425,000",
    discounted.ok && discounted.totalAmount,
    425_000,
  );

  // --- 6. 감사 로그 ---
  const log = await prisma.auditLog.findMany({
    orderBy: { createdAt: "asc" },
    select: { action: true, summary: true },
  });
  console.log("\n감사 로그");
  for (const entry of log) console.log(`  ${entry.action}  ${entry.summary}`);
  check(
    "액션 순서",
    log.map((l) => l.action),
    [
      "OPTION_CREATED",
      "OPTION_VERSION_ADDED",
      "OPTION_DEACTIVATED",
      "OPTION_DEACTIVATED",
      "OPTION_REACTIVATED",
      "OPTION_REACTIVATED",
    ],
  );

  console.log(failures === 0 ? "\n전부 통과" : `\n실패 ${failures}건`);
  if (failures > 0) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
