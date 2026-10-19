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
  /** true 면 고를 것이 없는 안내 단계다. 입력 없이 이름과 설명만 그린다 (ADR-0048) */
  noticeOnly: boolean;
  /** 이 그룹을 고르기 전에 선택이 있어야 하는 그룹 (ADR-0010) */
  dependsOnGroupId: string | null;
  /**
   * 선행이 옵션 하나로 좁혀진 그룹의 선행 옵션. null 이면 그룹에 선택이 있으면 충족 (ADR-0044)
   * **`code` 가 있는데 `id` 가 null 이면 해석 실패**이고 그 그룹은 열리지 않는다.
   */
  dependsOnOptionCode: string | null;
  dependsOnOptionId: string | null;
  /** 잠금 사유에 적을 이름. 화면이 만들지 않는다 */
  dependsOnOptionName: string | null;
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

  return products.map((p) => {
    // 선행 옵션은 코드로 저장돼 있다. 같은 상품 안에서 유효한 버전으로 해석한다. (ADR-0044)
    const latestByGroupId = new Map(
      p.optionGroups.map((g) => [
        g.id,
        new Map(latestPerKey(g.options, (o) => o.code).map((o) => [o.code, o])),
      ]),
    );

    return {
      id: p.id,
      name: p.name,
      groups: p.optionGroups.map((g) => {
        const descriptionByCode = new Map(
          g.optionDescriptions.map((d) => [d.optionCode, d]),
        );
        const prerequisiteOption =
          g.dependsOnGroupId !== null && g.dependsOnOptionCode !== null
            ? (latestByGroupId
                .get(g.dependsOnGroupId)
                ?.get(g.dependsOnOptionCode) ?? null)
            : null;
        return {
          id: g.id,
          name: g.name,
          required: g.required,
          singleSelect: g.singleSelect,
          selectAll: g.selectAll,
          noticeOnly: g.noticeOnly,
          dependsOnGroupId: g.dependsOnGroupId,
          dependsOnOptionCode: g.dependsOnOptionCode,
          dependsOnOptionId: prerequisiteOption?.id ?? null,
          dependsOnOptionName: prerequisiteOption?.name ?? null,
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
    };
  });
}
