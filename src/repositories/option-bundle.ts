import { prisma } from "@/lib/prisma";
import { optionKey } from "./option-revival";

/**
 * 묶음 관계 읽기·쓰기. (ADR-0037, ADR-0038)
 *
 * 가격 규칙 테이블이 아니라서 수정이 새 버전 `INSERT` 가 아니고 지우고 다시 쓴다.
 * 안내는 과거 견적의 근거가 아니므로 이전 상태를 남겨 둘 이유가 없다.
 */
export interface BundleSpec {
  groupCode: string;
  optionCode: string;
  components: { groupCode: string; optionCode: string }[];
}

export async function findProductBundles(
  productCode: string,
): Promise<BundleSpec[]> {
  const bundles = await prisma.optionBundle.findMany({
    where: { product: { code: productCode } },
    orderBy: [{ groupCode: "asc" }, { optionCode: "asc" }],
    select: {
      groupCode: true,
      optionCode: true,
      components: {
        orderBy: [{ groupCode: "asc" }, { optionCode: "asc" }],
        select: { groupCode: true, optionCode: true },
      },
    },
  });

  return bundles;
}

/**
 * 그 상품의 묶음 관계를 받은 목록으로 통째로 바꾼다.
 * 묶음 옵션과 구성 옵션이 실제로 있는지 먼저 확인한다. 없는 코드를 넣으면
 * 안내가 조용히 사라지기만 해서(Repository 가 해석 실패를 건너뛴다) 오타를 알 수 없다.
 */
export async function replaceProductBundles(
  productCode: string,
  bundles: BundleSpec[],
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { code: productCode },
    select: {
      id: true,
      optionGroups: {
        select: { code: true, options: { select: { code: true } } },
      },
    },
  });
  if (!product) throw new Error(`상품이 없습니다: ${productCode}`);

  const known = new Set(
    product.optionGroups.flatMap((g) =>
      g.options.map((o) => `${g.code}:${o.code}`),
    ),
  );

  for (const bundle of bundles) {
    for (const { groupCode, optionCode } of [bundle, ...bundle.components]) {
      if (!known.has(`${groupCode}:${optionCode}`)) {
        throw new Error(`옵션이 없습니다: ${groupCode}/${optionCode}`);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.optionBundle.deleteMany({ where: { productId: product.id } });

    for (const bundle of bundles) {
      await tx.optionBundle.create({
        data: {
          productId: product.id,
          groupCode: bundle.groupCode,
          optionCode: bundle.optionCode,
          components: { create: bundle.components },
        },
      });
    }
  });
}

export interface BundleTarget {
  productId: string;
  groupCode: string;
  optionCode: string;
}

export interface AddBundleInput extends BundleTarget {
  components: { groupCode: string; optionCode: string }[];
}

/**
 * 그 상품의 옵션 이름표. **꺼진 옵션도 담는다.** (ADR-0038)
 * 묶음 관계와 옵션 활성 여부는 독립이고, 꺼진 옵션으로 미리 묶어 둘 수 있어야 한다.
 */
async function findOptionNames(
  productId: string,
): Promise<Map<string, string>> {
  const rows = await prisma.productOption.findMany({
    where: { group: { productId, isActive: true } },
    orderBy: { effectiveFrom: "desc" },
    select: { code: true, name: true, group: { select: { code: true } } },
  });

  const nameByKey = new Map<string, string>();
  for (const row of rows) {
    const key = optionKey(row.group.code, row.code);
    if (!nameByKey.has(key)) nameByKey.set(key, row.name);
  }
  return nameByKey;
}

/**
 * 묶음 관계 등록. (ADR-0038)
 *
 * 수정이 없어서 이 함수는 항상 새 관계를 만든다. 구성 하나를 바꾸는 것은 지우고 다시 넣는 것이다.
 * **묶음이 더 싼지는 검증하지 않는다.** 안내 여부는 그때그때의 두 총액 차이가 정한다. (ADR-0037)
 */
export async function addProductBundle(
  input: AddBundleInput,
  actor: string,
): Promise<{ bundleName: string }> {
  const nameByKey = await findOptionNames(input.productId);

  const bundleKey = optionKey(input.groupCode, input.optionCode);
  const componentKeys = input.components.map((c) =>
    optionKey(c.groupCode, c.optionCode),
  );

  for (const key of [bundleKey, ...componentKeys]) {
    if (!nameByKey.has(key))
      throw new Error(`이 상품에 없는 옵션입니다: ${key}`);
  }

  // 1개면 묶음이 아니라 같은 것의 다른 이름이고, 0개면 안내가 뜨지 않는다.
  const distinct = new Set(componentKeys);
  if (distinct.size !== componentKeys.length)
    throw new Error("같은 구성 옵션을 두 번 넣을 수 없습니다.");
  if (distinct.size < 2) throw new Error("구성 옵션을 2개 이상 고르세요.");
  if (distinct.has(bundleKey))
    throw new Error("묶음 옵션은 구성 옵션에 넣을 수 없습니다.");

  // 유일 제약(productId, groupCode, optionCode) 위반을 500 으로 흘리지 않는다.
  const existing = await prisma.optionBundle.findUnique({
    where: {
      productId_groupCode_optionCode: {
        productId: input.productId,
        groupCode: input.groupCode,
        optionCode: input.optionCode,
      },
    },
    select: { id: true },
  });
  if (existing)
    throw new Error(
      `'${nameByKey.get(bundleKey)}' 의 묶음 관계가 이미 있습니다. 구성을 바꾸려면 지우고 다시 넣으세요.`,
    );

  const bundleName = nameByKey.get(bundleKey)!;
  const componentNames = componentKeys.map((key) => nameByKey.get(key)!);

  await prisma.$transaction([
    prisma.optionBundle.create({
      data: {
        productId: input.productId,
        groupCode: input.groupCode,
        optionCode: input.optionCode,
        components: { create: input.components },
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "BUNDLE_ADDED",
        actor,
        summary: `${bundleName} ← ${componentNames.join(" + ")} 묶음 등록`,
        targetType: "OptionBundle",
        targetId: bundleKey,
        afterValue: { components: componentKeys },
      },
    }),
  ]);

  return { bundleName };
}

/** 묶음 관계 삭제. 구성 행은 연쇄 삭제된다. 지운 구성까지 감사 기록에 남긴다. (ADR-0038) */
export async function removeProductBundle(
  input: BundleTarget,
  actor: string,
): Promise<{ bundleName: string }> {
  const bundle = await prisma.optionBundle.findUnique({
    where: {
      productId_groupCode_optionCode: {
        productId: input.productId,
        groupCode: input.groupCode,
        optionCode: input.optionCode,
      },
    },
    select: {
      id: true,
      components: { select: { groupCode: true, optionCode: true } },
    },
  });
  if (!bundle) throw new Error("묶음 관계를 찾을 수 없습니다.");

  const nameByKey = await findOptionNames(input.productId);
  const bundleKey = optionKey(input.groupCode, input.optionCode);
  const componentKeys = bundle.components.map((c) =>
    optionKey(c.groupCode, c.optionCode),
  );
  const bundleName = nameByKey.get(bundleKey) ?? bundleKey;

  await prisma.$transaction([
    prisma.optionBundle.delete({ where: { id: bundle.id } }),
    prisma.auditLog.create({
      data: {
        action: "BUNDLE_REMOVED",
        actor,
        summary: `${bundleName} 묶음 관계 삭제 (구성: ${componentKeys
          .map((key) => nameByKey.get(key) ?? key)
          .join(" + ")})`,
        targetType: "OptionBundle",
        targetId: bundleKey,
        beforeValue: { components: componentKeys },
      },
    }),
  ]);

  return { bundleName };
}
