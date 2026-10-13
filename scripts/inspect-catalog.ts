/** 전체 카탈로그 현재 상태를 읽는다. 읽기 전용. */
import { prisma } from "@/lib/prisma";

async function main() {
  const products = await prisma.product.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      optionGroups: {
        orderBy: { sortOrder: "asc" },
        include: {
          options: { orderBy: [{ sortOrder: "asc" }, { effectiveFrom: "asc" }] },
          optionDescriptions: true,
        },
      },
      discounts: {
        orderBy: [{ code: "asc" }, { effectiveFrom: "asc" }],
        include: { conditions: true },
      },
    },
  });

  for (const product of products) {
    console.log(
      `\n═══ ${product.code} ${product.name} (sort ${product.sortOrder}, ${product.isActive ? "활성" : "꺼짐"})`,
    );
    for (const group of product.optionGroups) {
      const dep = group.dependsOnGroupId
        ? product.optionGroups.find((g) => g.id === group.dependsOnGroupId)?.code
        : null;
      console.log(
        `\n  [${group.code}] ${group.name}  sort=${group.sortOrder} single=${group.singleSelect} required=${group.required}${dep ? ` 선행=${dep}` : ""} ${group.isActive ? "" : "(꺼짐)"}`,
      );
      if (group.summary) console.log(`    단계설명: ${group.summary}`);
      for (const o of group.options) {
        console.log(
          `    ${o.code.padEnd(14)} sort=${String(o.sortOrder).padStart(2)} ${o.isActive ? "on " : "OFF"} ${String(o.amount).padStart(9)} ${o.effectiveFrom.toISOString().slice(0, 10)}  ${o.name}`,
        );
      }
      for (const d of group.optionDescriptions) {
        console.log(`    설명[${d.optionCode}] ${JSON.stringify(d.summary)}`);
      }
    }
    for (const d of product.discounts) {
      console.log(
        `\n  할인 ${d.code} ${d.isActive ? "on " : "OFF"} rate=${d.rate} priority=${d.priority} ${d.effectiveFrom.toISOString().slice(0, 10)} ${d.name}`,
      );
      console.log(
        `    조건: ${d.conditions.map((c) => c.optionCode).join(", ") || "(없음)"}`,
      );
    }
  }

  console.log(`\n견적 ${await prisma.quote.count()}건`);
}

main().finally(() => prisma.$disconnect());
