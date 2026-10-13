/** 운영 서버(3100)의 /api/estimate 가 올스토리 확정값을 돌려주는지 확인. 읽기 전용. */
import { prisma } from "@/lib/prisma";
import { findRuleSet } from "@/repositories/pricing-rule";

/** [라벨, 단계 번호, 기대 소계, 기대 할인, 기대 총액] */
type Case = [string, number[], number, number, number];

// docs/pricing-rules.md 9-4
const G2_CASES: Case[] = [
  ["전단계 (통합등록)", [1, 2, 3, 4, 5, 6], 1_535_000, 45_000, 1_490_000],
  ["1~5단계", [1, 2, 3, 4, 5], 1_045_000, 0, 1_045_000],
  ["4단계만", [4], 149_000, 0, 149_000],
  ["6단계만", [6], 490_000, 0, 490_000],
];

// docs/pricing-rules.md 9-4-1
const G3_CASES: Case[] = [
  ["전단계 (통합등록)", [1, 2, 3, 4], 1_187_000, 37_000, 1_150_000],
  ["1~3단계", [1, 2, 3], 597_000, 0, 597_000],
  // 고2 3단계와 같은 상담이고 금액도 같다.
  ["1단계만", [1], 199_000, 0, 199_000],
  // 고2 6단계와 같은 상담이지만 금액이 다르다. (ADR-0030)
  ["4단계만", [4], 590_000, 0, 590_000],
];

async function check(productCode: string, cases: Case[]) {
  const product = await prisma.product.findUniqueOrThrow({
    where: { code: productCode },
  });
  const ruleSet = await findRuleSet(product.id, new Date());
  if (!ruleSet) throw new Error(`규칙이 없다: ${productCode}`);

  const stage = (n: number) =>
    ruleSet.options.find((o) => o.name.startsWith(`${n}단계`))!.id;

  console.log(`\n=== ${product.name} (${productCode}) ===`);

  for (const [label, stages, subtotal, discount, total] of cases) {
    const result = await fetch("http://localhost:3100/api/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: product.id,
        optionIds: stages.map(stage),
      }),
    }).then((r) => r.json());
    const ok =
      result.subtotal === subtotal &&
      result.discountAmount === discount &&
      result.totalAmount === total;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${label}: 소계 ${result.subtotal} 할인 ${result.discountAmount} 총액 ${result.totalAmount} (기대 ${subtotal} / ${discount} / ${total})`,
    );
  }

  // 단계 이름이 견적 스냅샷에 남는다. 제목과 소요 시간이 이름에 있어야 한다. (ADR-0028)
  for (const option of ruleSet.options) {
    console.log(`  ${option.name}  ${option.amount.toLocaleString("ko-KR")}원`);
  }
}

async function main() {
  await check("ALLSTORY_G2", G2_CASES);
  await check("ALLSTORY_G3", G3_CASES);
}

main().finally(() => prisma.$disconnect());
