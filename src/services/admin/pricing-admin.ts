import { findRuleSet } from "@/repositories/pricing-rule";
import {
  addDiscountVersion,
  addOptionVersion,
  createOption as createOptionRow,
  deactivateDiscount as deactivateDiscountRow,
  deactivateOption as deactivateOptionRow,
  findAuditLog,
  findPricingAdminView,
  reactivateOption as reactivateOptionRow,
  saveGroupDescription as saveGroupDescriptionRow,
  saveOptionDescription as saveOptionDescriptionRow,
  type AdminProductView,
  type AuditEntry,
  type CreateOptionInput,
  type DeactivateDiscountInput,
  type DeactivateOptionInput,
  type DeactivateOptionResult,
  type DescriptionInput,
  type OptionDescriptionInput,
  type ReactivateOptionInput,
  type ReactivateOptionResult,
} from "@/repositories/pricing-admin";
import {
  addProductBundle,
  removeProductBundle,
  type AddBundleInput,
  type BundleTarget,
} from "@/repositories/option-bundle";
import {
  reorderGroups as reorderGroupsRow,
  reorderOptions as reorderOptionsRow,
  reorderProducts as reorderProductsRow,
  type ReorderGroupsInput,
  type ReorderOptionsInput,
  type ReorderResult,
} from "@/repositories/pricing-order";
import { calculate } from "@/services/pricing/calculate";
import type { CalculationResult, RuleSet } from "@/services/pricing/types";

export type { AdminProductView, AuditEntry };

/**
 * 바꾸려는 값. 아직 저장되지 않은 상태로 미리보기에 쓴다.
 * 대상은 코드가 아니라 **현재 유효 버전의 행 id** 로 가리킨다.
 * RuleSet 은 코드를 들고 있지 않고, 관리자 화면은 이미 versionId 를 알고 있다.
 */
export type PendingChange =
  | { kind: "option"; optionVersionId: string; amount: number }
  | {
      kind: "discount";
      discountVersionId: string;
      amount: number;
      rateBp: number;
      priority: number;
    };

export async function getPricingAdminView(
  now: Date,
): Promise<AdminProductView[]> {
  return findPricingAdminView(now);
}

export async function getAuditLog(page: number): Promise<AuditEntry[]> {
  const take = 20;
  return findAuditLog(take, (page - 1) * take);
}

/**
 * 바꾸려는 값을 메모리 상의 규칙에만 반영한다. DB 는 건드리지 않는다.
 * 미리보기가 /api/estimate 와 같은 calculate 를 쓰게 하려고 입력을 갈아끼우는 방식이다.
 */
function withPendingChange(ruleSet: RuleSet, change: PendingChange): RuleSet {
  if (change.kind === "option") {
    return {
      ...ruleSet,
      options: ruleSet.options.map((option) =>
        option.id === change.optionVersionId
          ? { ...option, amount: change.amount }
          : option,
      ),
    };
  }

  return {
    ...ruleSet,
    discounts: ruleSet.discounts.map((discount) =>
      discount.id === change.discountVersionId
        ? {
            ...discount,
            amount: change.amount,
            rateBp: change.rateBp,
            priority: change.priority,
          }
        : discount,
    ),
  };
}

export interface PreviewResult {
  before: CalculationResult;
  after: CalculationResult;
}

/**
 * 저장 전 미리보기. 같은 선택으로 현재 규칙과 바꾼 규칙을 각각 계산해 나란히 보여준다.
 * 계산은 둘 다 pricing 의 calculate 다. 여기에 금액 산술은 없다.
 */
export async function previewChange(
  productId: string,
  optionIds: string[],
  change: PendingChange,
  now: Date,
): Promise<PreviewResult | null> {
  const ruleSet = await findRuleSet(productId, now);
  if (!ruleSet) return null;

  const input = { productId, optionIds };
  return {
    before: calculate(input, ruleSet, now),
    after: calculate(input, withPendingChange(ruleSet, change), now),
  };
}

export interface SaveOptionVersion {
  productId: string;
  groupCode: string;
  optionCode: string;
  name: string;
  amount: number;
  effectiveFrom: Date | null;
}

export async function saveOptionVersion(
  input: SaveOptionVersion,
  actor: string,
  now: Date,
): Promise<void> {
  // effectiveFrom 을 비워 두면 즉시 적용이다. (.claude/rules/admin.md)
  await addOptionVersion(
    { ...input, effectiveFrom: input.effectiveFrom ?? now },
    actor,
  );
}

export interface CreateOption {
  productId: string;
  groupCode: string;
  optionCode: string;
  name: string;
  amount: number;
  effectiveFrom: Date | null;
}

/** 기존 그룹 안에 새 옵션을 만든다. (ADR-0023) */
export async function createOption(
  input: CreateOption,
  actor: string,
  now: Date,
): Promise<void> {
  await createOptionRow(
    { ...input, effectiveFrom: input.effectiveFrom ?? now },
    actor,
  );
}

export interface SaveDiscountVersion {
  productId: string;
  discountCode: string;
  amount: number;
  rateBp: number;
  priority: number;
  effectiveFrom: Date | null;
}

export type {
  CreateOptionInput,
  DeactivateOptionResult,
  ReactivateOptionResult,
};

/**
 * 옵션 비활성화. 삭제하지 않는다. (`.claude/rules/database.md`)
 * 그 옵션을 조건으로 쓰는 할인도 함께 꺼진다. 어떤 할인이 꺼졌는지 돌려준다. (ADR-0017)
 */
export async function deactivateOption(
  input: DeactivateOptionInput,
  actor: string,
): Promise<DeactivateOptionResult> {
  return deactivateOptionRow(input, actor);
}

/**
 * 옵션 재활성화. 함께 꺼진 할인 중 조건이 전부 충족되는 것만 되살린다. (ADR-0023)
 * 되살린 할인과 보류한 할인을 돌려준다.
 */
export async function reactivateOption(
  input: ReactivateOptionInput,
  actor: string,
): Promise<ReactivateOptionResult> {
  return reactivateOptionRow(input, actor);
}

/**
 * 할인 비활성화. 옵션 비활성화와 달리 **조건 옵션은 건드리지 않는다.** (ADR-0026)
 * 할인이 없어도 옵션은 혼자 팔리므로, 할인을 끌 때 옵션까지 끄면 상담 항목이 사라진다.
 */
export async function deactivateDiscount(
  input: DeactivateDiscountInput,
  actor: string,
): Promise<{ discountName: string }> {
  return deactivateDiscountRow(input, actor);
}

export type { ReorderResult };

/**
 * 표시 순서 변경. 세 층 모두 **전체 순열**을 받는다. (ADR-0026)
 * 금액이 아니라 화면 배치라서 미리보기도, 적용 시작 시각도 없다. 지난 견적은 영향받지 않는다.
 */
export async function reorderProducts(
  productCodes: string[],
  actor: string,
): Promise<ReorderResult> {
  return reorderProductsRow(productCodes, actor);
}

export async function reorderGroups(
  input: ReorderGroupsInput,
  actor: string,
): Promise<ReorderResult> {
  return reorderGroupsRow(input, actor);
}

export async function reorderOptions(
  input: ReorderOptionsInput,
  actor: string,
): Promise<ReorderResult> {
  return reorderOptionsRow(input, actor);
}

export async function saveDiscountVersion(
  input: SaveDiscountVersion,
  actor: string,
  now: Date,
): Promise<void> {
  await addDiscountVersion(
    { ...input, effectiveFrom: input.effectiveFrom ?? now },
    actor,
  );
}

/**
 * 설명 문구 수정. 금액을 바꾸지 않으므로 미리보기도, 적용 시작 시각도 없다. (ADR-0025)
 * `now` 를 받지 않는 것이 이 작업과 가격 버전 작업의 차이다.
 */
export async function saveGroupDescription(
  input: DescriptionInput,
  actor: string,
): Promise<void> {
  await saveGroupDescriptionRow(input, actor);
}

export async function saveOptionDescription(
  input: OptionDescriptionInput,
  actor: string,
): Promise<void> {
  await saveOptionDescriptionRow(input, actor);
}

export type { AddBundleInput, BundleTarget };

/**
 * 묶음 관계 등록. 금액이 아니라 안내라서 미리보기도, 적용 시작 시각도 없다. (ADR-0038)
 * `now` 를 받지 않는 것이 설명·순서 작업과 같고 가격 버전 작업과 다른 점이다.
 */
export async function addBundle(
  input: AddBundleInput,
  actor: string,
): Promise<{ bundleName: string }> {
  return addProductBundle(input, actor);
}

/** 묶음 관계 삭제. 수정이 없으므로 구성 변경도 이 삭제를 거친다. (ADR-0038) */
export async function removeBundle(
  input: BundleTarget,
  actor: string,
): Promise<{ bundleName: string }> {
  return removeProductBundle(input, actor);
}
