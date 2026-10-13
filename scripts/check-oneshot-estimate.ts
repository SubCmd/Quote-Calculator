/** 운영 서버(3100)의 /api/estimate 가 새 카탈로그로 맞는 금액을 돌려주는지 확인. 읽기 전용. */
import { prisma } from "@/lib/prisma";
import { findRuleSet } from "@/repositories/pricing-rule";

async function main() {
  const product = await prisma.product.findUniqueOrThrow({
    where: { code: "ONESHOT" },
  });
  const ruleSet = await findRuleSet(product.id, new Date());
  if (!ruleSet) throw new Error("규칙이 없다");

  const idOf = (prefix: string) =>
    ruleSet.options.find((o) => o.name.startsWith(prefix))!.id;

  const cases: [string, string[], number][] = [
    [
      "분석 3개",
      [idOf("내신 성적 분석"), idOf("모의고사"), idOf("생활기록부 분석 (")],
      267_000,
    ],
    ["묶음 옵션", [idOf("내신 + 생활기록부")], 199_000],
  ];

  for (const [label, optionIds, expected] of cases) {
    const result = await fetch("http://localhost:3100/api/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product.id, optionIds }),
    }).then((r) => r.json());
    const ok = result.totalAmount === expected && result.discountAmount === 0;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${label}: 소계 ${result.subtotal} 할인 ${result.discountAmount} 총액 ${result.totalAmount} (기대 ${expected}) 후보 ${result.discountCandidates?.length}`,
    );
  }
}

main().finally(() => prisma.$disconnect());
