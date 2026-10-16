import { prisma } from "@/lib/prisma";
import { latestPerKey } from "./latest-version";

/** 설명 문구. 없는 것이 정상이다. (ADR-0025) */
export interface Description {
  /** 이름 아래 항상 보이는 한 줄 */
  summary: string | null;
  /** 펼쳐서 읽는 긴 안내 */
  detail: string | null;
}

export interface CatalogOption extends Description {
  id: string;
  name: string;
}

export interface CatalogGroup extends Description {
  id: string;
  name: string;
  required: boolean;
  singleSelect: boolean;
  /** true 면 그룹 옵션을 한 번에 켜는 버튼을 그린다 (ADR-0043) */
  selectAll: boolean;
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
          // 설명은 금액 테이블과 분리돼 있다. 옵션 코드로 맞춰 붙인다. (ADR-0025)
          optionDescriptions: {
            select: { optionCode: true, summary: true, detail: true },
          },
        },
      },
    },
  });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    groups: p.optionGroups.map((g) => {
      const descriptionByCode = new Map(
        g.optionDescriptions.map((d) => [d.optionCode, d]),
      );
      return {
        id: g.id,
        name: g.name,
        required: g.required,
        singleSelect: g.singleSelect,
        selectAll: g.selectAll,
        dependsOnGroupId: g.dependsOnGroupId,
        summary: g.summary,
        detail: g.detail,
        options: latestPerKey(g.options, (o) => o.code)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((o) => ({
            id: o.id,
            name: o.name,
            summary: descriptionByCode.get(o.code)?.summary ?? null,
            detail: descriptionByCode.get(o.code)?.detail ?? null,
          })),
      };
    }),
  }));
}
