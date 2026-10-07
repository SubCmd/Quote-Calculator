import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toBp } from "@/lib/money";
import type { RuleSet } from "@/services/pricing/types";
import { latestPerKey } from "./latest-version";

function rateToBp(rate: Prisma.Decimal): number {
  return toBp(rate.toNumber());
}

function conditionKey(groupCode: string, optionCode: string): string {
  return `${groupCode}:${optionCode}`;
}

export async function findRuleSet(
  productId: string,
  now: Date,
): Promise<RuleSet | null> {
  const product = await prisma.product.findFirst({
    where: { id: productId, isActive: true },
    include: {
      discounts: {
        where: { isActive: true, effectiveFrom: { lte: now } },
        orderBy: { effectiveFrom: "desc" },
        include: { conditions: true },
      },
      optionGroups: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          options: {
            // latestPerKey 가 첫 행을 최신으로 보므로 effectiveFrom 이 1순위여야 한다.
            // 버전마다 sortOrder 가 다를 수 있어 sortOrder 를 앞에 두면 구 버전이 뽑힌다.
            where: { isActive: true, effectiveFrom: { lte: now } },
            orderBy: { effectiveFrom: "desc" },
          },
        },
      },
    },
  });

  if (!product) return null;

  // 할인 조건은 옵션 코드로 저장되어 있다. 지금 유효한 버전의 id 로 해석한다. (ADR-0009)
  const optionIdByCode = new Map<string, string>();

  const options = product.optionGroups.flatMap((group) =>
    latestPerKey(group.options, (o) => o.code)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((o) => {
        optionIdByCode.set(conditionKey(group.code, o.code), o.id);
        return {
          id: o.id,
          groupId: o.groupId,
          name: o.name,
          amount: o.amount,
          versionId: o.id,
        };
      }),
  );

  const discounts = latestPerKey(product.discounts, (d) => d.code).map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type,
    amount: d.amount,
    rateBp: rateToBp(d.rate),
    requiredOptionIds: d.conditions.map((c) => {
      const optionId = optionIdByCode.get(
        conditionKey(c.groupCode, c.optionCode),
      );
      // 조건을 조용히 무시하면 할인이 과하게 걸린다. 데이터 오류로 다룬다.
      if (!optionId) {
        throw new Error(
          `할인 '${d.code}' 의 조건 옵션을 찾을 수 없습니다: ${c.groupCode}/${c.optionCode}`,
        );
      }
      return optionId;
    }),
    priority: d.priority,
    versionId: d.id,
  }));

  return {
    product: { id: product.id, name: product.name },
    groups: product.optionGroups.map((g) => ({
      id: g.id,
      name: g.name,
      required: g.required,
      singleSelect: g.singleSelect,
      dependsOnGroupId: g.dependsOnGroupId,
    })),
    options,
    discounts,
  };
}
