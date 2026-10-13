/** 운영 서버(3100)의 /api/estimate 가 과정 컨설팅 확정값을 돌려주는지 확인. 읽기 전용. */
import { prisma } from "@/lib/prisma";
import { findRuleSet } from "@/repositories/pricing-rule";

async function main() {
  const product = await prisma.product.findUniqueOrThrow({
    where: { code: "COURSE" },
  });
  const ruleSet = await findRuleSet(product.id, new Date());
  if (!ruleSet) throw new Error("규칙이 없다");

  const idOf = (prefix: string) =>
    ruleSet.options.find((o) => o.name.startsWith(prefix))!.id;

  const cases: [string, string[], number][] = [
    // docs/pricing-rules.md 9-3
    ["6회차 + 카톡 + 10건", [idOf("6회차"), idOf("카톡 소통"), idOf("10건")], 1_940_000],
    // docs/pricing-rules.md 9-3-1
    ["3회차 + 모의고사 추가", [idOf("3회차"), idOf("모의고사 성적 분석")], 639_000],
    ["3회차 + 이메일", [idOf("3회차"), idOf("이메일 소통")], 679_000],
  ];

  for (const [label, optionIds, expected] of cases) {
    const result = await fetch("http://localhost:3100/api/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product.id, optionIds }),
    }).then((r) => r.json());
    const ok = result.totalAmount === expected && result.discountAmount === 0;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${label}: 소계 ${result.subtotal} 할인 ${result.discountAmount} 총액 ${result.totalAmount} (기대 ${expected})`,
    );
  }

  // 회차 없이 추가 옵션만 고르면 선행 위반이다. (ADR-0027)
  const violation = await fetch("http://localhost:3100/api/estimate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productId: product.id,
      optionIds: [idOf("모의고사 성적 분석")],
    }),
  }).then((r) => r.json());
  const codes = (violation.violations ?? []).map(
    (v: { code: string }) => v.code,
  );
  console.log(
    `${codes.includes("GROUP_PREREQUISITE_UNMET") ? "PASS" : "FAIL"}  회차 없이 추가 옵션만 → 선행 위반 (${codes.join(", ") || "위반 없음"})`,
  );
}

main().finally(() => prisma.$disconnect());
