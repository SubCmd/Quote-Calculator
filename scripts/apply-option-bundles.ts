/**
 * 묶음 관계를 운영 데이터에 반영한다. 일회성 스크립트다. (ADR-0037)
 *
 * 금액을 바꾸지 않는다. 구성 옵션을 전부 고른 고객에게 더 싼 묶음 옵션을
 * 안내하기 위한 관계 데이터만 쓴다. 그래서 가격 버전도 감사 로그도 남지 않는다.
 *
 * 기본은 미리보기다. 실제로 쓰려면 `--apply` 를 붙인다.
 *   npx tsx scripts/apply-option-bundles.ts
 *   npx tsx scripts/apply-option-bundles.ts --apply
 */
import { prisma } from "@/lib/prisma";
import {
  findProductBundles,
  replaceProductBundles,
  type BundleSpec,
} from "@/repositories/option-bundle";

const apply = process.argv.includes("--apply");

/** 1회성 컨설팅 V1 은 내신과 생활기록부를 합친 상담이다. */
const BUNDLES: { productCode: string; bundles: BundleSpec[] }[] = [
  {
    productCode: "ONESHOT",
    bundles: [
      {
        groupCode: "ANALYSIS",
        optionCode: "V1",
        components: [
          { groupCode: "ANALYSIS", optionCode: "NAESIN" },
          { groupCode: "ANALYSIS", optionCode: "RECORD" },
        ],
      },
    ],
  },
];

function describe(bundles: BundleSpec[]): string {
  if (bundles.length === 0) return "    (없음)";
  return bundles
    .map(
      (b) =>
        `    ${b.groupCode}/${b.optionCode} ← ${b.components
          .map((c) => `${c.groupCode}/${c.optionCode}`)
          .join(" + ")}`,
    )
    .join("\n");
}

async function main() {
  console.log(`\n${apply ? "적용" : "미리보기 (쓰지 않는다)"}\n`);

  for (const target of BUNDLES) {
    const current = await findProductBundles(target.productCode);

    console.log(target.productCode);
    console.log("  이전");
    console.log(describe(current));
    console.log("  이후");
    console.log(describe(target.bundles));

    if (apply) {
      await replaceProductBundles(target.productCode, target.bundles);
      console.log("  반영함");
    }
  }

  if (!apply) console.log("\n--apply 를 붙이면 실제로 씁니다.");
}

main().finally(() => prisma.$disconnect());
