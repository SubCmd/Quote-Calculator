import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { latestPerKey } from "./latest-version";

export interface AdminOptionRow {
  versionId: string;
  groupId: string;
  groupCode: string;
  groupName: string;
  code: string;
  name: string;
  amount: number;
  effectiveFrom: Date;
  versionCount: number;
}

export interface AdminDiscountRow {
  versionId: string;
  code: string;
  name: string;
  type: "FIXED" | "RATE";
  amount: number;
  /** 화면 표시용 퍼센트 문자열. 계산에는 쓰지 않는다 */
  ratePercent: string;
  priority: number;
  conditions: { groupCode: string; optionCode: string }[];
  effectiveFrom: Date;
  versionCount: number;
}

export interface AdminProductView {
  id: string;
  code: string;
  name: string;
  options: AdminOptionRow[];
  discounts: AdminDiscountRow[];
}

/** 관리자 화면용 현재 유효 버전 목록. 버전 개수도 함께 센다. */
export async function findPricingAdminView(
  now: Date,
): Promise<AdminProductView[]> {
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
          },
        },
      },
      discounts: {
        where: { isActive: true, effectiveFrom: { lte: now } },
        orderBy: { effectiveFrom: "desc" },
        include: { conditions: { orderBy: { groupCode: "asc" } } },
      },
    },
  });

  return products.map((product) => {
    const countByOptionCode = new Map<string, number>();
    for (const group of product.optionGroups) {
      for (const option of group.options) {
        const key = `${group.code}:${option.code}`;
        countByOptionCode.set(key, (countByOptionCode.get(key) ?? 0) + 1);
      }
    }

    const countByDiscountCode = new Map<string, number>();
    for (const discount of product.discounts) {
      countByDiscountCode.set(
        discount.code,
        (countByDiscountCode.get(discount.code) ?? 0) + 1,
      );
    }

    return {
      id: product.id,
      code: product.code,
      name: product.name,
      options: product.optionGroups.flatMap((group) =>
        latestPerKey(group.options, (o) => o.code)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((option) => ({
            versionId: option.id,
            groupId: group.id,
            groupCode: group.code,
            groupName: group.name,
            code: option.code,
            name: option.name,
            amount: option.amount,
            effectiveFrom: option.effectiveFrom,
            versionCount:
              countByOptionCode.get(`${group.code}:${option.code}`) ?? 1,
          })),
      ),
      discounts: latestPerKey(product.discounts, (d) => d.code).map(
        (discount) => ({
          versionId: discount.id,
          code: discount.code,
          name: discount.name,
          type: discount.type,
          amount: discount.amount,
          ratePercent: discount.rate.mul(100).toFixed(2),
          priority: discount.priority,
          conditions: discount.conditions.map((c) => ({
            groupCode: c.groupCode,
            optionCode: c.optionCode,
          })),
          effectiveFrom: discount.effectiveFrom,
          versionCount: countByDiscountCode.get(discount.code) ?? 1,
        }),
      ),
    };
  });
}

export interface OptionVersionInput {
  productId: string;
  groupCode: string;
  optionCode: string;
  amount: number;
  effectiveFrom: Date;
}

/** 옵션 금액 새 버전 추가. 기존 행은 건드리지 않는다. (ADR-0002) */
export async function addOptionVersion(
  input: OptionVersionInput,
  actor: string,
): Promise<void> {
  const group = await prisma.optionGroup.findFirst({
    where: {
      productId: input.productId,
      code: input.groupCode,
      isActive: true,
    },
    include: { options: { orderBy: { effectiveFrom: "desc" } } },
  });
  if (!group)
    throw new Error(`옵션 그룹을 찾을 수 없습니다: ${input.groupCode}`);

  const current = group.options.find((o) => o.code === input.optionCode);
  if (!current) throw new Error(`옵션을 찾을 수 없습니다: ${input.optionCode}`);

  await prisma.$transaction([
    prisma.productOption.create({
      data: {
        groupId: group.id,
        code: current.code,
        name: current.name,
        amount: input.amount,
        sortOrder: current.sortOrder,
        effectiveFrom: input.effectiveFrom,
        createdBy: actor,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "OPTION_VERSION_ADDED",
        actor,
        summary: `${current.name} 금액 ${current.amount.toLocaleString("ko-KR")}원 → ${input.amount.toLocaleString("ko-KR")}원`,
        targetType: "ProductOption",
        targetId: `${input.groupCode}:${input.optionCode}`,
        beforeValue: {
          amount: current.amount,
          effectiveFrom: current.effectiveFrom.toISOString(),
        },
        afterValue: {
          amount: input.amount,
          effectiveFrom: input.effectiveFrom.toISOString(),
        },
      },
    }),
  ]);
}

export interface DiscountVersionInput {
  productId: string;
  discountCode: string;
  /** RATE 는 만분율 정수(bp), FIXED 는 원 단위 정수 */
  amount: number;
  rateBp: number;
  priority: number;
  effectiveFrom: Date;
}

/** 할인 새 버전 추가. 조건은 현재 버전에서 그대로 복제한다. */
export async function addDiscountVersion(
  input: DiscountVersionInput,
  actor: string,
): Promise<void> {
  const current = await prisma.discountRule.findFirst({
    where: {
      productId: input.productId,
      code: input.discountCode,
      isActive: true,
    },
    orderBy: { effectiveFrom: "desc" },
    include: { conditions: true },
  });
  if (!current)
    throw new Error(`할인 규칙을 찾을 수 없습니다: ${input.discountCode}`);

  const rate: Prisma.Decimal.Value = (input.rateBp / 10000).toFixed(4);
  const beforeRate = current.rate.toFixed(4);

  await prisma.$transaction([
    prisma.discountRule.create({
      data: {
        productId: current.productId,
        code: current.code,
        name: current.name,
        type: current.type,
        amount: input.amount,
        rate,
        priority: input.priority,
        effectiveFrom: input.effectiveFrom,
        createdBy: actor,
        conditions: {
          create: current.conditions.map((c) => ({
            groupCode: c.groupCode,
            optionCode: c.optionCode,
          })),
        },
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "DISCOUNT_VERSION_ADDED",
        actor,
        summary:
          current.type === "RATE"
            ? `${current.name} 할인율 ${(Number(beforeRate) * 100).toFixed(2)}% → ${(input.rateBp / 100).toFixed(2)}%`
            : `${current.name} 할인액 ${current.amount.toLocaleString("ko-KR")}원 → ${input.amount.toLocaleString("ko-KR")}원`,
        targetType: "DiscountRule",
        targetId: input.discountCode,
        beforeValue: {
          amount: current.amount,
          rate: beforeRate,
          priority: current.priority,
          effectiveFrom: current.effectiveFrom.toISOString(),
        },
        afterValue: {
          amount: input.amount,
          rate,
          priority: input.priority,
          effectiveFrom: input.effectiveFrom.toISOString(),
        },
      },
    }),
  ]);
}

export interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  summary: string;
  createdAt: Date;
}

export async function findAuditLog(
  take: number,
  skip: number,
): Promise<AuditEntry[]> {
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take,
    skip,
    select: {
      id: true,
      action: true,
      actor: true,
      summary: true,
      createdAt: true,
    },
  });
  return rows;
}
