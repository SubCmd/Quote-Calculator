/**
 * 표시 순서 쓰기. 순서는 가격이 아니라 화면 배치라서 버전을 남기지 않고 덮어쓴다. (ADR-0026)
 *
 * 판정은 `display-order.ts` 의 순수 함수가 하고, 이 파일은 읽기·쓰기·감사 기록만 한다.
 * 세 층(상품 탭·단계·옵션)이 같은 모양이라 함수도 같은 모양으로 둔다.
 */
import { prisma } from "@/lib/prisma";
import { planReorder } from "./display-order";
import { latestPerKey } from "./latest-version";

export interface ReorderResult {
  /** 순서가 실제로 달라졌는지. 같으면 쓰지도 않고 감사 기록도 남기지 않는다. */
  changed: boolean;
}

const UNCHANGED: ReorderResult = { changed: false };

/** 감사 기록 한 줄. 이름으로 적는다. 코드만 적으면 나중에 읽을 수 없다. */
function orderLine(keys: string[], nameByKey: Map<string, string>): string {
  return keys.map((key) => nameByKey.get(key) ?? key).join(" > ");
}

interface AuditInput {
  scope: string;
  targetType: string;
  targetId: string;
  before: string[];
  after: string[];
  nameByKey: Map<string, string>;
  actor: string;
}

function auditEntry(input: AuditInput) {
  return prisma.auditLog.create({
    data: {
      action: "DISPLAY_ORDER_CHANGED" as const,
      actor: input.actor,
      summary: `${input.scope} 순서: ${orderLine(input.before, input.nameByKey)} → ${orderLine(input.after, input.nameByKey)}`,
      targetType: input.targetType,
      targetId: input.targetId,
      beforeValue: { order: input.before },
      afterValue: { order: input.after },
    },
  });
}

/**
 * 상품 탭 순서. 키는 상품 `code` 다.
 *
 * 목록이 하나뿐이라 감사 기록의 `targetId` 도 하나로 고정한다. 탭 순서 변경 이력이
 * 한 줄에 모여야 "누가 언제 탭을 옮겼나" 를 한 번에 읽을 수 있다.
 *
 * **꺼진 상품도 순열에 들어간다.** (ADR-0046 §2) 꺼진 옵션을 빼지 않는 것과 같은 이유로
 * 되살렸을 때 자리가 유지돼야 하고, 화면 목록과 범위가 어긋나면 전체 순열 검증이 통과하지
 * 못해 순서를 아예 바꿀 수 없게 된다.
 */
export async function reorderProducts(
  productCodes: string[],
  actor: string,
): Promise<ReorderResult> {
  const products = await prisma.product.findMany({
    orderBy: { sortOrder: "asc" },
    select: { code: true, name: true },
  });

  const current = products.map((p) => p.code);
  const plan = planReorder(current, productCodes);
  if (!plan.changed) return UNCHANGED;

  await prisma.$transaction([
    ...[...plan.sortOrderByKey].map(([code, sortOrder]) =>
      prisma.product.update({ where: { code }, data: { sortOrder } }),
    ),
    auditEntry({
      scope: "상품 탭",
      targetType: "Product",
      targetId: "ALL",
      before: current,
      after: productCodes,
      nameByKey: new Map(products.map((p) => [p.code, p.name])),
      actor,
    }),
  ]);

  return { changed: true };
}

export interface ReorderGroupsInput {
  productId: string;
  groupCodes: string[];
}

/**
 * 단계(그룹) 순서. 키는 그룹 `code` 다. `OptionGroup` 은 버전 테이블이 아니라 행 하나를 고친다. (ADR-0010)
 *
 * 선행 그룹보다 위로 올리는 것은 거부한다. 선행이 충족되지 않은 그룹은 `disabled` 로 그려지므로,
 * 위에 두면 화면 맨 위가 "먼저 아래 항목을 선택하세요" 로 시작한다. 고르는 순서를
 * 거꾸로 읽히게 만드는 배치라서 저장 전에 막는다.
 */
export async function reorderGroups(
  input: ReorderGroupsInput,
  actor: string,
): Promise<ReorderResult> {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: {
      code: true,
      optionGroups: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          dependsOnGroupId: true,
        },
      },
    },
  });
  if (!product) throw new Error(`상품을 찾을 수 없습니다: ${input.productId}`);

  const groups = product.optionGroups;
  const current = groups.map((g) => g.code);
  const plan = planReorder(current, input.groupCodes);
  if (!plan.changed) return UNCHANGED;

  const codeById = new Map(groups.map((g) => [g.id, g.code]));
  const nameByCode = new Map(groups.map((g) => [g.code, g.name]));
  for (const group of groups) {
    if (!group.dependsOnGroupId) continue;
    const prerequisite = codeById.get(group.dependsOnGroupId);
    if (!prerequisite) continue;
    if (
      plan.sortOrderByKey.get(group.code)! <
      plan.sortOrderByKey.get(prerequisite)!
    )
      throw new Error(
        `'${group.name}' 은 먼저 고르는 '${nameByCode.get(prerequisite)}' 보다 위에 둘 수 없습니다.`,
      );
  }

  const idByCode = new Map(groups.map((g) => [g.code, g.id]));

  await prisma.$transaction([
    ...[...plan.sortOrderByKey].map(([code, sortOrder]) =>
      prisma.optionGroup.update({
        where: { id: idByCode.get(code)! },
        data: { sortOrder },
      }),
    ),
    auditEntry({
      scope: `${product.code} 단계`,
      targetType: "OptionGroup",
      targetId: product.code,
      before: current,
      after: input.groupCodes,
      nameByKey: new Map(groups.map((g) => [g.code, g.name])),
      actor,
    }),
  ]);

  return { changed: true };
}

export interface ReorderOptionsInput {
  productId: string;
  groupCode: string;
  optionCodes: string[];
}

/**
 * 한 그룹 안의 옵션 순서. 키는 옵션 `code` 다.
 *
 * **꺼진 옵션도 묶음에 넣는다.** 빼면 되살린 옵션이 제 자리로 돌아오지 못하고,
 * 활성 목록만 1..n 으로 다시 매기는 동안 꺼진 옵션의 `sortOrder` 가 그 사이에 끼인 채 남는다.
 *
 * 그 코드의 **모든 버전 행**에 같은 값을 쓴다. 최신 행만 고치면 적용 시작 시각이 지나기 전후로
 * 화면 순서가 저절로 바뀐다. (ADR-0026)
 */
export async function reorderOptions(
  input: ReorderOptionsInput,
  actor: string,
): Promise<ReorderResult> {
  const group = await prisma.optionGroup.findFirst({
    where: {
      productId: input.productId,
      code: input.groupCode,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      product: { select: { code: true } },
      options: {
        orderBy: { effectiveFrom: "desc" },
        select: {
          code: true,
          name: true,
          sortOrder: true,
          effectiveFrom: true,
        },
      },
    },
  });
  if (!group)
    throw new Error(`옵션 그룹을 찾을 수 없습니다: ${input.groupCode}`);

  const latest = latestPerKey(group.options, (o) => o.code).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  const current = latest.map((o) => o.code);
  const plan = planReorder(current, input.optionCodes);
  if (!plan.changed) return UNCHANGED;

  await prisma.$transaction([
    ...[...plan.sortOrderByKey].map(([code, sortOrder]) =>
      prisma.productOption.updateMany({
        where: { groupId: group.id, code },
        data: { sortOrder },
      }),
    ),
    auditEntry({
      scope: `${group.name} 옵션`,
      targetType: "ProductOption",
      targetId: `${group.product.code}:${input.groupCode}`,
      before: current,
      after: input.optionCodes,
      nameByKey: new Map(latest.map((o) => [o.code, o.name])),
      actor,
    }),
  ]);

  return { changed: true };
}
