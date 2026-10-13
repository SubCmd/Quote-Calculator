/** 1회성 컨설팅 현재 상태 읽기 전용 확인. 아무것도 쓰지 않는다. */
import { prisma } from "@/lib/prisma";

async function main() {
  const product = await prisma.product.findUnique({
    where: { code: "ONESHOT" },
    include: {
      optionGroups: {
        orderBy: { sortOrder: "asc" },
        include: {
          options: { orderBy: [{ code: "asc" }, { effectiveFrom: "asc" }] },
          optionDescriptions: true,
        },
      },
      discounts: {
        orderBy: { effectiveFrom: "asc" },
        include: { conditions: true },
      },
    },
  });
  if (!product) throw new Error("ONESHOT 상품이 없다");

  console.log(`\n상품 ${product.name} (${product.code}) sortOrder=${product.sortOrder}`);
  for (const group of product.optionGroups) {
    console.log(`\n  그룹 ${group.code} "${group.name}" sortOrder=${group.sortOrder} active=${group.isActive}`);
    console.log(`    summary=${JSON.stringify(group.summary)}`);
    for (const o of group.options) {
      console.log(
        `    ${o.code.padEnd(8)} sort=${o.sortOrder} active=${o.isActive} ${String(o.amount).padStart(8)}원  from=${o.effectiveFrom.toISOString()}  "${o.name}"`,
      );
    }
    for (const d of group.optionDescriptions) {
      console.log(`    [설명] ${d.optionCode}: ${JSON.stringify(d.summary)} / detail=${JSON.stringify(d.detail)}`);
    }
  }

  console.log("\n  할인");
  for (const d of product.discounts) {
    console.log(
      `    ${d.code} active=${d.isActive} type=${d.type} rate=${d.rate} amount=${d.amount} from=${d.effectiveFrom.toISOString()} conditions=${d.conditions.map((c) => `${c.groupCode}.${c.optionCode}`).join(",")}`,
    );
  }

  const all = await prisma.product.findMany({
    orderBy: { sortOrder: "asc" },
    select: { code: true, name: true, sortOrder: true, isActive: true },
  });
  console.log("\n상품 탭 순서");
  for (const p of all) console.log(`    ${p.sortOrder}  ${p.code}  active=${p.isActive}  ${p.name}`);

  const quotes = await prisma.quote.count();
  console.log(`\n발행된 견적 ${quotes}건`);
}

main().finally(() => prisma.$disconnect());
