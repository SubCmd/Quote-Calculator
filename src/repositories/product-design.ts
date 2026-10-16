import { prisma } from "@/lib/prisma";
import { canSetProductActive } from "@/lib/product-activation";

/**
 * 상품(상위 탭)과 단계(그룹) 신설, 상품 활성화. (ADR-0046)
 *
 * `product.ts` 와 나눠 둔다. 그쪽은 고객 카탈로그 조회이고 이쪽은 관리자 쓰기다.
 * 금액을 다루지 않으므로 `effectiveFrom` 도 버전 행도 없다.
 */

/** 신설 화면이 그리는 상품 한 줄. 비활성 상품도 들어간다. (ADR-0046 §9 영향) */
export interface ProductDesignRow {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  /** 켤 수 있는지 판정하는 입력. 그룹 수는 보지 않는다 */
  activeOptionCount: number;
  groups: ProductDesignGroupRow[];
}

export interface ProductDesignGroupRow {
  id: string;
  code: string;
  name: string;
  required: boolean;
  singleSelect: boolean;
  selectAll: boolean;
  /** 선행 그룹 이름. 화면이 id 를 사람 글자로 바꾸지 않는다 */
  dependsOnGroupName: string | null;
  dependsOnOptionCode: string | null;
  /** 선행 그룹으로 고를 수 있는지 보여주려면 id 가 필요하다 */
  dependsOnGroupId: string | null;
  activeOptionCount: number;
  /** 선행 옵션 코드 선택지. 그 그룹에 실제로 있는 코드만 */
  optionCodes: string[];
}

export async function findProductDesignView(): Promise<ProductDesignRow[]> {
  const products = await prisma.product.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }],
    include: {
      optionGroups: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          options: {
            where: { isActive: true },
            select: { code: true },
          },
        },
      },
    },
  });

  return products.map((product) => {
    const groupNameById = new Map(
      product.optionGroups.map((group) => [group.id, group.name]),
    );

    const groups = product.optionGroups.map((group) => {
      // 같은 코드의 금액 버전이 여러 행이다. 옵션 개수는 코드 단위로 센다. (ADR-0002)
      const codes = [...new Set(group.options.map((option) => option.code))];

      return {
        id: group.id,
        code: group.code,
        name: group.name,
        required: group.required,
        singleSelect: group.singleSelect,
        selectAll: group.selectAll,
        dependsOnGroupId: group.dependsOnGroupId,
        dependsOnGroupName:
          group.dependsOnGroupId === null
            ? null
            : (groupNameById.get(group.dependsOnGroupId) ?? null),
        dependsOnOptionCode: group.dependsOnOptionCode,
        activeOptionCount: codes.length,
        optionCodes: codes.sort(),
      };
    });

    return {
      id: product.id,
      code: product.code,
      name: product.name,
      isActive: product.isActive,
      sortOrder: product.sortOrder,
      activeOptionCount: groups.reduce(
        (sum, group) => sum + group.activeOptionCount,
        0,
      ),
      groups,
    };
  });
}

export interface CreateProductInput {
  code: string;
  name: string;
}

/**
 * 상품 신설. **비활성으로 만든다.** (ADR-0046 §2)
 * `sortOrder` 는 받지 않고 맨 뒤에 붙인다. 자리는 표시 순서 화면이 옮긴다. (ADR-0026)
 */
export async function createProduct(
  input: CreateProductInput,
  actor: string,
): Promise<void> {
  // 꺼진 상품도 본다. 같은 코드가 비활성으로 있으면 되살리는 길은 재활성화 하나다.
  const existing = await prisma.product.findUnique({
    where: { code: input.code },
    select: { name: true, isActive: true },
  });
  if (existing)
    throw new Error(
      `이미 '${input.code}' 코드의 상품이 있습니다 (${existing.name}). ` +
        `${existing.isActive ? "" : "꺼져 있다면 활성화로 되살리세요."}`.trim(),
    );

  const last = await prisma.product.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  await prisma.$transaction([
    prisma.product.create({
      data: {
        code: input.code,
        name: input.name,
        sortOrder,
        isActive: false,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "PRODUCT_CREATED",
        actor,
        summary: `상품 ${input.name} 추가 (${input.code}, 비활성)`,
        targetType: "Product",
        targetId: input.code,
        afterValue: { code: input.code, name: input.name, sortOrder },
      },
    }),
  ]);
}

export interface CreateGroupInput {
  productId: string;
  code: string;
  name: string;
  required: boolean;
  singleSelect: boolean;
  selectAll: boolean;
  dependsOnGroupId: string | null;
  dependsOnOptionCode: string | null;
}

/**
 * 단계(그룹) 신설. 선행 관계는 **같은 상품의 이미 있는 그룹**만 가리킨다. (ADR-0046 §5)
 * 새 그룹은 맨 뒤라서 선행 그룹이 저절로 위에 있다. (ADR-0026)
 */
export async function createOptionGroup(
  input: CreateGroupInput,
  actor: string,
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: {
      optionGroups: {
        include: {
          options: { where: { isActive: true }, select: { code: true } },
        },
      },
    },
  });
  if (!product) throw new Error("상품을 찾을 수 없습니다.");

  if (product.optionGroups.some((group) => group.code === input.code))
    throw new Error(`이 상품에 이미 '${input.code}' 코드의 단계가 있습니다.`);

  let prerequisite = null;
  if (input.dependsOnGroupId !== null) {
    prerequisite =
      product.optionGroups.find(
        (group) => group.id === input.dependsOnGroupId,
      ) ?? null;
    // 다른 상품의 그룹을 가리키면 외래 키는 통과하지만 뜻이 성립하지 않는다.
    if (!prerequisite)
      throw new Error("선행 단계는 같은 상품에 이미 있는 단계여야 합니다.");

    if (
      input.dependsOnOptionCode !== null &&
      !prerequisite.options.some(
        (option) => option.code === input.dependsOnOptionCode,
      )
    )
      throw new Error(
        `선행 단계 '${prerequisite.name}' 에 '${input.dependsOnOptionCode}' 옵션이 없습니다.`,
      );
  }

  const sortOrder =
    product.optionGroups.reduce(
      (max, group) => Math.max(max, group.sortOrder),
      -1,
    ) + 1;

  await prisma.$transaction([
    prisma.optionGroup.create({
      data: {
        productId: product.id,
        code: input.code,
        name: input.name,
        required: input.required,
        singleSelect: input.singleSelect,
        selectAll: input.selectAll,
        dependsOnGroupId: input.dependsOnGroupId,
        dependsOnOptionCode: input.dependsOnOptionCode,
        sortOrder,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "PRODUCT_GROUP_CREATED",
        actor,
        summary: `${product.name} 상품에 '${input.name}' 단계 추가 (${input.code})`,
        targetType: "OptionGroup",
        targetId: `${product.code}.${input.code}`,
        afterValue: {
          code: input.code,
          name: input.name,
          required: input.required,
          singleSelect: input.singleSelect,
          selectAll: input.selectAll,
          dependsOnGroup: prerequisite?.code ?? null,
          dependsOnOptionCode: input.dependsOnOptionCode,
          sortOrder,
        },
      },
    }),
  ]);
}

/**
 * 상품 활성화·비활성화. 판정은 `canSetProductActive` 하나다. (ADR-0046 §2)
 * **연쇄가 없다.** 그 상품의 그룹·옵션·할인·묶음을 건드리지 않는다. (ADR-0046 §6)
 */
export async function setProductActive(
  productId: string,
  active: boolean,
  actor: string,
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      optionGroups: {
        where: { isActive: true },
        include: {
          options: { where: { isActive: true }, select: { code: true } },
        },
      },
    },
  });
  if (!product) throw new Error("상품을 찾을 수 없습니다.");

  const activeOptionCount = new Set(
    product.optionGroups.flatMap((group) =>
      group.options.map((option) => `${group.code}.${option.code}`),
    ),
  ).size;

  const check = canSetProductActive(
    { isActive: product.isActive, activeOptionCount },
    active,
  );
  if (!check.allowed) throw new Error(check.reason);

  await prisma.$transaction([
    prisma.product.update({
      where: { id: product.id },
      data: { isActive: active },
    }),
    prisma.auditLog.create({
      data: {
        action: active ? "PRODUCT_ACTIVATED" : "PRODUCT_DEACTIVATED",
        actor,
        summary: `상품 ${product.name} ${active ? "활성화" : "비활성화"}`,
        targetType: "Product",
        targetId: product.code,
        beforeValue: { isActive: product.isActive },
        afterValue: { isActive: active },
      },
    }),
  ]);
}
