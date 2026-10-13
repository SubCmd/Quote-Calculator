import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { latestPerKey } from "./latest-version";
import { optionKey, planDiscountRevival } from "./option-revival";

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
  /** 화면 표시 순서. 꺼진 옵션과 한 줄로 묶어 순서를 매기는 데 쓴다. (ADR-0026) */
  sortOrder: number;
  /** 설명 문구. 금액과 달리 버전을 남기지 않는다. (ADR-0025) */
  summary: string | null;
  detail: string | null;
}

/** 신규 옵션을 넣을 그룹 선택지. 그룹 자체는 이 화면에서 만들지 않는다. (ADR-0023) */
export interface AdminGroupRow {
  code: string;
  name: string;
  /** 단계 설명. 편집 대상이다. (ADR-0025) */
  summary: string | null;
  detail: string | null;
}

/** 꺼진 옵션. 되살릴 때 함께 켜지는/켜지지 않는 할인을 미리 달고 내려간다. (ADR-0023) */
export interface AdminInactiveOptionRow {
  versionId: string;
  groupCode: string;
  groupName: string;
  code: string;
  name: string;
  amount: number;
  versionCount: number;
  /** 꺼진 옵션도 순서 묶음에 들어간다. 빼면 되살렸을 때 제 자리로 돌아오지 못한다. (ADR-0026) */
  sortOrder: number;
  reactivatableDiscounts: { code: string; name: string }[];
  blockedDiscounts: { code: string; name: string; missing: string[] }[];
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
  groups: AdminGroupRow[];
  options: AdminOptionRow[];
  inactiveOptions: AdminInactiveOptionRow[];
  discounts: AdminDiscountRow[];
}

/**
 * 관리자 화면용 현재 유효 버전 목록. 버전 개수도 함께 센다.
 *
 * 꺼진 옵션·할인까지 읽는다. 재활성화 화면이 필요해서다. (ADR-0023)
 * 비활성화는 같은 코드의 모든 버전을 함께 끄므로(ADR-0017) 코드 단위로 활성/비활성이 갈린다.
 * 섞인 상태가 없어서 최신 버전 행의 플래그로 그 코드 전체를 판정할 수 있다.
 * 고객 화면이 쓰는 `findRuleSet` 은 여전히 활성만 읽는다. 여기만 넓다.
 */
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
            where: { effectiveFrom: { lte: now } },
            orderBy: { effectiveFrom: "desc" },
          },
          optionDescriptions: {
            select: { optionCode: true, summary: true, detail: true },
          },
        },
      },
      discounts: {
        where: { effectiveFrom: { lte: now } },
        orderBy: { effectiveFrom: "desc" },
        include: { conditions: { orderBy: { groupCode: "asc" } } },
      },
    },
  });

  return products.map((product) => {
    const countByOptionCode = new Map<string, number>();
    for (const group of product.optionGroups) {
      for (const option of group.options) {
        const key = optionKey(group.code, option.code);
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

    const latestOptions = product.optionGroups.flatMap((group) =>
      latestPerKey(group.options, (o) => o.code)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((option) => ({ group, option })),
    );
    const latestDiscounts = latestPerKey(product.discounts, (d) => d.code);

    const activeOptionKeys = new Set(
      latestOptions
        .filter(({ option }) => option.isActive)
        .map(({ group, option }) => optionKey(group.code, option.code)),
    );
    const nameByOptionKey = new Map(
      latestOptions.map(({ group, option }) => [
        optionKey(group.code, option.code),
        option.name,
      ]),
    );
    const inactiveDiscounts = latestDiscounts.filter((d) => !d.isActive);

    // 설명은 `(groupId, optionCode)` 를 키로 따로 저장된다. (ADR-0025)
    const descriptionByKey = new Map(
      product.optionGroups.flatMap((group) =>
        group.optionDescriptions.map((d) => [
          optionKey(group.code, d.optionCode),
          d,
        ]),
      ),
    );

    return {
      id: product.id,
      code: product.code,
      name: product.name,
      groups: product.optionGroups.map((group) => ({
        code: group.code,
        name: group.name,
        summary: group.summary,
        detail: group.detail,
      })),
      options: latestOptions
        .filter(({ option }) => option.isActive)
        .map(({ group, option }) => {
          const key = optionKey(group.code, option.code);
          return {
            versionId: option.id,
            groupId: group.id,
            groupCode: group.code,
            groupName: group.name,
            code: option.code,
            name: option.name,
            amount: option.amount,
            effectiveFrom: option.effectiveFrom,
            versionCount: countByOptionCode.get(key) ?? 1,
            sortOrder: option.sortOrder,
            summary: descriptionByKey.get(key)?.summary ?? null,
            detail: descriptionByKey.get(key)?.detail ?? null,
          };
        }),
      inactiveOptions: latestOptions
        .filter(({ option }) => !option.isActive)
        .map(({ group, option }) => {
          const key = optionKey(group.code, option.code);
          const plan = planDiscountRevival(
            inactiveDiscounts.filter((d) =>
              d.conditions.some(
                (c) => optionKey(c.groupCode, c.optionCode) === key,
              ),
            ),
            activeOptionKeys,
            key,
          );
          return {
            versionId: option.id,
            groupCode: group.code,
            groupName: group.name,
            code: option.code,
            name: option.name,
            amount: option.amount,
            versionCount: countByOptionCode.get(key) ?? 1,
            sortOrder: option.sortOrder,
            reactivatableDiscounts: plan.revivable,
            blockedDiscounts: plan.blocked.map((blocked) => ({
              code: blocked.code,
              name: blocked.name,
              missing: blocked.missing.map(
                (missingKey) => nameByOptionKey.get(missingKey) ?? missingKey,
              ),
            })),
          };
        }),
      discounts: latestDiscounts
        .filter((discount) => discount.isActive)
        .map((discount) => ({
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
        })),
    };
  });
}

const won = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;

const SAME_INSTANT =
  "같은 적용 시작 시각의 버전이 이미 있습니다. 시각을 다르게 지정하세요.";

async function assertNoSameInstantOption(
  groupId: string,
  code: string,
  effectiveFrom: Date,
): Promise<void> {
  const existing = await prisma.productOption.findFirst({
    where: { groupId, code, effectiveFrom },
    select: { id: true },
  });
  if (existing) throw new Error(SAME_INSTANT);
}

export interface OptionVersionInput {
  productId: string;
  groupCode: string;
  optionCode: string;
  name: string;
  amount: number;
  effectiveFrom: Date;
}

/**
 * 옵션 이름·금액 새 버전 추가. 기존 행은 건드리지 않는다. (ADR-0002)
 * 이름만 바뀌어도 버전 행을 남긴다. 어느 시점에 뭐라고 불렸는지가 과거 견적을 읽을 때 필요하다. (ADR-0023)
 * `code` 는 바꿀 수 없다. 할인 조건이 코드로 옵션을 가리킨다. (ADR-0009)
 *
 * **활성 옵션만** 대상이다. 꺼진 옵션에 버전을 넣으면 활성 행이 하나 생겨 옵션이 조용히 되살아나는데,
 * 조건 할인은 여전히 꺼진 상태라서 비활성화가 지키던 짝이 깨진다. 되살리는 길은 재활성화 하나다.
 */
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
    include: {
      options: { where: { isActive: true }, orderBy: { effectiveFrom: "desc" } },
    },
  });
  if (!group)
    throw new Error(`옵션 그룹을 찾을 수 없습니다: ${input.groupCode}`);

  const current = group.options.find((o) => o.code === input.optionCode);
  if (!current) throw new Error(`옵션을 찾을 수 없습니다: ${input.optionCode}`);

  // (groupId, code, effectiveFrom) 가 유일하다. 적용 시작 시각 입력은 분 단위라
  // 같은 분에 두 번 저장하는 일이 실제로 생긴다. 제약 위반을 500 으로 흘리지 않는다.
  await assertNoSameInstantOption(group.id, input.optionCode, input.effectiveFrom);

  const changes: string[] = [];
  if (current.name !== input.name)
    changes.push(`이름 ${current.name} → ${input.name}`);
  if (current.amount !== input.amount)
    changes.push(`금액 ${won(current.amount)} → ${won(input.amount)}`);

  await prisma.$transaction([
    prisma.productOption.create({
      data: {
        groupId: group.id,
        code: current.code,
        name: input.name,
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
        summary:
          changes.length === 0
            ? `${current.name} 버전 추가 (값 변화 없음)`
            : `${current.name} ${changes.join(", ")}`,
        targetType: "ProductOption",
        targetId: optionKey(input.groupCode, input.optionCode),
        beforeValue: {
          name: current.name,
          amount: current.amount,
          effectiveFrom: current.effectiveFrom.toISOString(),
        },
        afterValue: {
          name: input.name,
          amount: input.amount,
          effectiveFrom: input.effectiveFrom.toISOString(),
        },
      },
    }),
  ]);
}

export interface CreateOptionInput {
  productId: string;
  groupCode: string;
  optionCode: string;
  name: string;
  amount: number;
  effectiveFrom: Date;
}

/**
 * 기존 그룹 안에 새 옵션을 만든다. 그룹은 여기서 만들지 않는다. (ADR-0023)
 * 같은 코드가 **꺼진 것으로라도** 있으면 거부한다. 되살리는 길은 재활성화 하나여야 한다.
 */
export async function createOption(
  input: CreateOptionInput,
  actor: string,
): Promise<void> {
  const group = await prisma.optionGroup.findFirst({
    where: {
      productId: input.productId,
      code: input.groupCode,
      isActive: true,
    },
    include: { options: true },
  });
  if (!group)
    throw new Error(`옵션 그룹을 찾을 수 없습니다: ${input.groupCode}`);

  if (group.options.some((o) => o.code === input.optionCode))
    throw new Error(
      `이 그룹에 이미 '${input.optionCode}' 코드의 옵션이 있습니다. 꺼져 있다면 재활성화로 되살리세요.`,
    );

  const sortOrder =
    group.options.reduce((max, o) => Math.max(max, o.sortOrder), -1) + 1;

  await prisma.$transaction([
    prisma.productOption.create({
      data: {
        groupId: group.id,
        code: input.optionCode,
        name: input.name,
        amount: input.amount,
        sortOrder,
        effectiveFrom: input.effectiveFrom,
        createdBy: actor,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "OPTION_CREATED",
        actor,
        summary: `${group.name} 그룹에 ${input.name} 추가 (${won(input.amount)})`,
        targetType: "ProductOption",
        targetId: optionKey(input.groupCode, input.optionCode),
        afterValue: {
          name: input.name,
          amount: input.amount,
          sortOrder,
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

  // (productId, code, effectiveFrom) 가 유일하다. 옵션 버전과 같은 이유로 미리 막는다.
  const sameInstant = await prisma.discountRule.findFirst({
    where: {
      productId: input.productId,
      code: input.discountCode,
      effectiveFrom: input.effectiveFrom,
    },
    select: { id: true },
  });
  if (sameInstant) throw new Error(SAME_INSTANT);

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

export interface DeactivateDiscountInput {
  productId: string;
  discountCode: string;
}

/**
 * 할인 비활성화. 같은 코드의 **모든 버전 행**을 끈다. (ADR-0002)
 *
 * 옵션 비활성화와 달리 **조건 옵션은 건드리지 않는다.** (ADR-0026)
 * 방향이 한쪽으로만 흐른다. 할인은 조건 옵션이 꺼지면 해석되지 않아 함께 꺼져야 하지만(ADR-0017),
 * 옵션은 할인이 없어도 혼자 팔린다. 할인을 끌 때 옵션까지 끄면 고를 수 있던 상담이 사라진다.
 *
 * 되살리는 길은 새 버전 추가가 아니라 재활성화다. 지우지 않는 이유는 지난 견적의 근거라서다.
 */
export async function deactivateDiscount(
  input: DeactivateDiscountInput,
  actor: string,
): Promise<{ discountName: string }> {
  const current = await prisma.discountRule.findFirst({
    where: {
      productId: input.productId,
      code: input.discountCode,
      isActive: true,
    },
    orderBy: { effectiveFrom: "desc" },
    select: { name: true },
  });
  if (!current)
    throw new Error(`할인 규칙을 찾을 수 없습니다: ${input.discountCode}`);

  await prisma.$transaction([
    prisma.discountRule.updateMany({
      where: { productId: input.productId, code: input.discountCode },
      data: { isActive: false },
    }),
    prisma.auditLog.create({
      data: {
        action: "DISCOUNT_DEACTIVATED",
        actor,
        summary: `${current.name} 비활성화 (조건 옵션은 그대로 둔다)`,
        targetType: "DiscountRule",
        targetId: input.discountCode,
        beforeValue: { isActive: true },
        afterValue: { isActive: false },
      },
    }),
  ]);

  return { discountName: current.name };
}

export interface DeactivateOptionInput {
  productId: string;
  groupCode: string;
  optionCode: string;
}

export interface DeactivateOptionResult {
  optionName: string;
  /** 조건이 깨지지 않도록 함께 끈 할인들 (ADR-0017) */
  deactivatedDiscounts: { code: string; name: string }[];
}

/**
 * 옵션 비활성화. 같은 코드의 **모든 버전 행**을 끈다. (ADR-0017)
 * 최신 한 행만 끄면 구 버전이 유효 버전으로 되살아난다.
 * 그 코드를 조건으로 쓰는 할인은 함께 끈다. 남겨 두면 `findRuleSet` 이 조건을 해석하지 못한다.
 */
export async function deactivateOption(
  input: DeactivateOptionInput,
  actor: string,
): Promise<DeactivateOptionResult> {
  const group = await prisma.optionGroup.findFirst({
    where: {
      productId: input.productId,
      code: input.groupCode,
      isActive: true,
    },
    include: {
      options: {
        where: { code: input.optionCode, isActive: true },
        orderBy: { effectiveFrom: "desc" },
      },
    },
  });
  if (!group)
    throw new Error(`옵션 그룹을 찾을 수 없습니다: ${input.groupCode}`);

  const current = group.options[0];
  if (!current) throw new Error(`옵션을 찾을 수 없습니다: ${input.optionCode}`);

  const affected = await prisma.discountRule.findMany({
    where: {
      productId: input.productId,
      isActive: true,
      conditions: {
        some: { groupCode: input.groupCode, optionCode: input.optionCode },
      },
    },
    select: { code: true, name: true },
  });
  const discountCodes = [...new Set(affected.map((d) => d.code))];
  const discounts = discountCodes.map((code) => ({
    code,
    name: affected.find((d) => d.code === code)!.name,
  }));

  const suffix =
    discounts.length === 0
      ? ""
      : ` (함께 비활성화: ${discounts.map((d) => d.name).join(", ")})`;

  await prisma.$transaction([
    prisma.productOption.updateMany({
      where: { groupId: group.id, code: input.optionCode },
      data: { isActive: false },
    }),
    prisma.discountRule.updateMany({
      where: { productId: input.productId, code: { in: discountCodes } },
      data: { isActive: false },
    }),
    prisma.auditLog.create({
      data: {
        action: "OPTION_DEACTIVATED",
        actor,
        summary: `${current.name} 비활성화${suffix}`,
        targetType: "ProductOption",
        targetId: `${input.groupCode}:${input.optionCode}`,
        beforeValue: { isActive: true },
        afterValue: { isActive: false, deactivatedDiscountCodes: discountCodes },
      },
    }),
  ]);

  return { optionName: current.name, deactivatedDiscounts: discounts };
}

export interface ReactivateOptionInput {
  productId: string;
  groupCode: string;
  optionCode: string;
}

export interface ReactivateOptionResult {
  optionName: string;
  /** 조건이 전부 충족되어 함께 되살린 할인 */
  reactivatedDiscounts: { code: string; name: string }[];
  /** 조건 옵션이 아직 꺼져 있어 끈 채로 둔 할인 */
  blockedDiscounts: { code: string; name: string; missing: string[] }[];
}

/**
 * 옵션 재활성화. 비활성화(ADR-0017)의 정확한 역이다. (ADR-0023)
 * 같은 코드의 **모든 버전 행**을 켠다. 최신 한 행만 켜면 유효 버전 선택이 상황에 따라 달라진다.
 *
 * 함께 꺼진 할인도 되살리지만, **조건 옵션이 전부 활성이 되는 것만** 켠다.
 * 아직 꺼진 조건이 남은 할인을 켜면 `findRuleSet` 이 조건을 해석하지 못해
 * 그 상품 계산이 통째로 실패한다. (ADR-0009)
 */
export async function reactivateOption(
  input: ReactivateOptionInput,
  actor: string,
): Promise<ReactivateOptionResult> {
  const group = await prisma.optionGroup.findFirst({
    where: {
      productId: input.productId,
      code: input.groupCode,
      isActive: true,
    },
    include: {
      options: {
        where: { code: input.optionCode, isActive: false },
        orderBy: { effectiveFrom: "desc" },
      },
    },
  });
  if (!group)
    throw new Error(`옵션 그룹을 찾을 수 없습니다: ${input.groupCode}`);

  const current = group.options[0];
  if (!current)
    throw new Error(`되살릴 옵션을 찾을 수 없습니다: ${input.optionCode}`);

  // 상품 전체의 옵션을 한 번에 읽어 활성 키 집합과 이름 표를 함께 만든다.
  const rows = await prisma.productOption.findMany({
    where: { group: { productId: input.productId, isActive: true } },
    orderBy: { effectiveFrom: "desc" },
    select: {
      code: true,
      name: true,
      isActive: true,
      group: { select: { code: true } },
    },
  });
  const activeOptionKeys = new Set<string>();
  const nameByOptionKey = new Map<string, string>();
  for (const row of rows) {
    const key = optionKey(row.group.code, row.code);
    if (!nameByOptionKey.has(key)) nameByOptionKey.set(key, row.name);
    if (row.isActive) activeOptionKeys.add(key);
  }

  const candidates = await prisma.discountRule.findMany({
    where: {
      productId: input.productId,
      isActive: false,
      conditions: {
        some: { groupCode: input.groupCode, optionCode: input.optionCode },
      },
    },
    orderBy: { effectiveFrom: "desc" },
    select: {
      code: true,
      name: true,
      conditions: { select: { groupCode: true, optionCode: true } },
    },
  });

  const plan = planDiscountRevival(
    candidates,
    activeOptionKeys,
    optionKey(input.groupCode, input.optionCode),
  );
  const revivedCodes = plan.revivable.map((d) => d.code);
  const blockedDiscounts = plan.blocked.map((blocked) => ({
    code: blocked.code,
    name: blocked.name,
    missing: blocked.missing.map((key) => nameByOptionKey.get(key) ?? key),
  }));

  const parts = [
    plan.revivable.length === 0
      ? null
      : `함께 재활성화: ${plan.revivable.map((d) => d.name).join(", ")}`,
    blockedDiscounts.length === 0
      ? null
      : `조건 미충족으로 보류: ${blockedDiscounts.map((d) => d.name).join(", ")}`,
  ].filter((part) => part !== null);
  const suffix = parts.length === 0 ? "" : ` (${parts.join(" / ")})`;

  await prisma.$transaction([
    prisma.productOption.updateMany({
      where: { groupId: group.id, code: input.optionCode },
      data: { isActive: true },
    }),
    prisma.discountRule.updateMany({
      where: { productId: input.productId, code: { in: revivedCodes } },
      data: { isActive: true },
    }),
    prisma.auditLog.create({
      data: {
        action: "OPTION_REACTIVATED",
        actor,
        summary: `${current.name} 재활성화${suffix}`,
        targetType: "ProductOption",
        targetId: optionKey(input.groupCode, input.optionCode),
        beforeValue: { isActive: false },
        afterValue: {
          isActive: true,
          reactivatedDiscountCodes: revivedCodes,
          blockedDiscountCodes: blockedDiscounts.map((d) => d.code),
        },
      },
    }),
  ]);

  return {
    optionName: current.name,
    reactivatedDiscounts: plan.revivable,
    blockedDiscounts,
  };
}

export interface DescriptionInput {
  productId: string;
  groupCode: string;
  summary: string | null;
  detail: string | null;
}

export interface OptionDescriptionInput extends DescriptionInput {
  optionCode: string;
}

/** 저장할 값과 지금 값이 같은지. 같으면 쓰지 않는다. 같은 내용의 감사 기록을 쌓지 않는다. */
function sameText(
  before: { summary: string | null; detail: string | null },
  after: { summary: string | null; detail: string | null },
): boolean {
  return before.summary === after.summary && before.detail === after.detail;
}

function describeChange(
  label: string,
  before: { summary: string | null; detail: string | null },
  after: { summary: string | null; detail: string | null },
): string {
  const changed = [
    before.summary !== after.summary ? "한 줄 설명" : null,
    before.detail !== after.detail ? "자세한 설명" : null,
  ].filter((part) => part !== null);
  return `${label} ${changed.join("·")} 수정`;
}

/**
 * 단계(그룹) 설명 수정. 새 버전이 아니라 덮어쓰기다. (ADR-0025)
 * 설명은 과거 견적의 근거가 아니라 현재 안내문이라서 버전을 남기지 않는다.
 * 그래도 누가 무엇을 바꿨는지는 남겨야 하므로 감사 기록은 같은 트랜잭션에서 쓴다.
 */
export async function saveGroupDescription(
  input: DescriptionInput,
  actor: string,
): Promise<void> {
  const group = await prisma.optionGroup.findFirst({
    where: { productId: input.productId, code: input.groupCode, isActive: true },
    select: { id: true, name: true, summary: true, detail: true },
  });
  if (!group)
    throw new Error(`옵션 그룹을 찾을 수 없습니다: ${input.groupCode}`);

  const after = { summary: input.summary, detail: input.detail };
  if (sameText(group, after)) return;

  await prisma.$transaction([
    prisma.optionGroup.update({ where: { id: group.id }, data: after }),
    prisma.auditLog.create({
      data: {
        action: "DESCRIPTION_UPDATED",
        actor,
        summary: describeChange(`${group.name} 단계`, group, after),
        targetType: "OptionGroup",
        targetId: `${input.productId}:${input.groupCode}`,
        beforeValue: { summary: group.summary, detail: group.detail },
        afterValue: after,
      },
    }),
  ]);
}

/**
 * 옵션 설명 수정. 대상은 `(groupId, optionCode)` 다. 옵션 행 id 는 금액 버전마다 바뀐다. (ADR-0025)
 * 그래서 금액을 수정해도 설명은 그대로 따라온다.
 *
 * 활성 옵션만 대상이다. 없는 코드에 설명을 넣으면 화면에 뜨지 않는 행만 남는다.
 */
export async function saveOptionDescription(
  input: OptionDescriptionInput,
  actor: string,
): Promise<void> {
  const group = await prisma.optionGroup.findFirst({
    where: { productId: input.productId, code: input.groupCode, isActive: true },
    select: {
      id: true,
      options: {
        where: { code: input.optionCode, isActive: true },
        orderBy: { effectiveFrom: "desc" },
        select: { name: true },
        take: 1,
      },
      optionDescriptions: {
        where: { optionCode: input.optionCode },
        select: { summary: true, detail: true },
      },
    },
  });
  if (!group)
    throw new Error(`옵션 그룹을 찾을 수 없습니다: ${input.groupCode}`);

  const option = group.options[0];
  if (!option) throw new Error(`옵션을 찾을 수 없습니다: ${input.optionCode}`);

  const before = group.optionDescriptions[0] ?? { summary: null, detail: null };
  const after = { summary: input.summary, detail: input.detail };
  if (sameText(before, after)) return;

  await prisma.$transaction([
    prisma.optionDescription.upsert({
      where: {
        groupId_optionCode: {
          groupId: group.id,
          optionCode: input.optionCode,
        },
      },
      create: {
        groupId: group.id,
        optionCode: input.optionCode,
        ...after,
        createdBy: actor,
      },
      update: after,
    }),
    prisma.auditLog.create({
      data: {
        action: "DESCRIPTION_UPDATED",
        actor,
        summary: describeChange(option.name, before, after),
        targetType: "OptionDescription",
        targetId: optionKey(input.groupCode, input.optionCode),
        beforeValue: before,
        afterValue: after,
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
