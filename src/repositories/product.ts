import { prisma } from "@/lib/prisma";
import { latestPerKey } from "./latest-version";

export interface CatalogOption {
  id: string;
  name: string;
}

export interface CatalogGroup {
  id: string;
  name: string;
  required: boolean;
  singleSelect: boolean;
  /** 이 그룹을 고르기 전에 선택이 있어야 하는 그룹 (ADR-0010) */
  dependsOnGroupId: string | null;
  options: CatalogOption[];
}

export interface CatalogProduct {
  id: string;
  name: string;
  groups: CatalogGroup[];
}

/** 화면에 보여줄 상품·옵션 목록. 금액은 포함하지 않는다. (ADR-0003) */
export async function findCatalog(now: Date): Promise<CatalogProduct[]> {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      optionGroups: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          options: {
            where: { isActive: true, effectiveFrom: { lte: now } },
            orderBy: { effectiveFrom: "desc" },
            select: { id: true, name: true, code: true, sortOrder: true },
          },
        },
      },
    },
  });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    groups: p.optionGroups.map((g) => ({
      id: g.id,
      name: g.name,
      required: g.required,
      singleSelect: g.singleSelect,
      dependsOnGroupId: g.dependsOnGroupId,
      options: latestPerKey(g.options, (o) => o.code)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((o) => ({ id: o.id, name: o.name })),
    })),
  }));
}
