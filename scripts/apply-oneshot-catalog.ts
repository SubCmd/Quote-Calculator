/**
 * 1회성 컨설팅 카탈로그를 확정값으로 맞춘다. 일회성 운영 데이터 반영 스크립트다.
 *
 * 금액·이름은 **새 버전 INSERT** 로 바꾸고(ADR-0002), 설명은 덮어쓰고(ADR-0025),
 * 묶음 할인은 비활성화한다(ADR-0026). 전부 Service 를 거치므로 감사 로그가 함께 남는다.
 *
 * 기본은 미리보기다. 실제로 쓰려면 `--apply` 를 붙인다.
 *   npx tsx scripts/apply-oneshot-catalog.ts
 *   npx tsx scripts/apply-oneshot-catalog.ts --apply
 */
import { prisma } from "@/lib/prisma";
import {
  deactivateDiscount,
  getPricingAdminView,
  reorderOptions,
  saveOptionDescription,
  saveOptionVersion,
} from "@/services/admin/pricing-admin";

const ACTOR = "admin";
const GROUP = "ANALYSIS";
const apply = process.argv.includes("--apply");

/** 소요 시간은 이름 안에 있다. 이름이 견적 스냅샷에 남아 인쇄물까지 따라간다. (ADR-0026) */
const CATALOG = [
  {
    code: "NAESIN",
    name: "내신 성적 분석 (30분)",
    amount: 59_000,
    summary: "내신 성적 수준, 대학교 수준, 대학교 지원 어디까지 가능한지?",
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
    summary: "생활기록부 수준, 전공적합성 코칭, 지원 대학 수준 학생부 종합전형 원리 코칭",
  },
  {
    code: "V1",
    name: "내신 + 생활기록부 분석 (60~70분)",
    amount: 199_000,
    summary: null,
  },
];

const ORDER = CATALOG.map((o) => o.code);

async function main() {
  const now = new Date();
  const products = await getPricingAdminView(now);
  const product = products.find((p) => p.code === "ONESHOT");
  if (!product) throw new Error("ONESHOT 상품이 없다");

  console.log(`\n${apply ? "적용" : "미리보기 (쓰지 않는다)"}\n`);

  for (const target of CATALOG) {
    const current = product.options.find(
      (o) => o.groupCode === GROUP && o.code === target.code,
    );
    if (!current) throw new Error(`옵션이 없다: ${target.code}`);

    const nameChanged = current.name !== target.name;
    const amountChanged = current.amount !== target.amount;
    const summaryChanged = (current.summary ?? null) !== target.summary;
    const detailChanged = current.detail !== null;

    console.log(`${target.code}`);
    console.log(
      `  이름 ${current.name} → ${target.name}${nameChanged ? "" : "  (변화 없음)"}`,
    );
    console.log(
      `  금액 ${current.amount.toLocaleString("ko-KR")} → ${target.amount.toLocaleString("ko-KR")}${amountChanged ? "" : "  (변화 없음)"}`,
    );
    console.log(
      `  설명 ${JSON.stringify(current.summary)} → ${JSON.stringify(target.summary)}${summaryChanged ? "" : "  (변화 없음)"}`,
    );
    if (detailChanged) console.log(`  긴 설명 ${JSON.stringify(current.detail)} → null`);

    if (!apply) continue;

    if (nameChanged || amountChanged) {
      await saveOptionVersion(
        {
          productId: product.id,
          groupCode: GROUP,
          optionCode: target.code,
          name: target.name,
          amount: target.amount,
          effectiveFrom: null,
        },
        ACTOR,
        now,
      );
    }
    if (summaryChanged || detailChanged) {
      await saveOptionDescription(
        {
          productId: product.id,
          groupCode: GROUP,
          optionCode: target.code,
          summary: target.summary,
          detail: null,
        },
        ACTOR,
      );
    }
  }

  const bundle = product.discounts.find((d) => d.code === "BUNDLE_ALL");
  console.log(
    `\nBUNDLE_ALL ${bundle ? "활성 → 비활성" : "이미 없다 (변화 없음)"}`,
  );
  if (apply && bundle) {
    await deactivateDiscount(
      { productId: product.id, discountCode: "BUNDLE_ALL" },
      ACTOR,
    );
  }

  const currentOrder = product.options
    .filter((o) => o.groupCode === GROUP)
    .map((o) => o.code);
  console.log(`\n옵션 순서 ${currentOrder.join(" > ")} → ${ORDER.join(" > ")}`);
  if (apply) {
    const result = await reorderOptions(
      { productId: product.id, groupCode: GROUP, optionCodes: ORDER },
      ACTOR,
    );
    console.log(`  ${result.changed ? "변경함" : "이미 같은 순서다"}`);
  }

  if (!apply) console.log("\n--apply 를 붙이면 실제로 씁니다.");
}

main().finally(() => prisma.$disconnect());
