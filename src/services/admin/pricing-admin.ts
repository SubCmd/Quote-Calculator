import { findRuleSet } from "@/repositories/pricing-rule";
import {
  addDiscountVersion,
  addOptionVersion,
  createOption as createOptionRow,
  deactivateOption as deactivateOptionRow,
  findAuditLog,
  findPricingAdminView,
  reactivateOption as reactivateOptionRow,
  type AdminProductView,
  type AuditEntry,
  type CreateOptionInput,
  type DeactivateOptionInput,
  type DeactivateOptionResult,
  type ReactivateOptionInput,
  type ReactivateOptionResult,
} from "@/repositories/pricing-admin";
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

export type { CreateOptionInput, DeactivateOptionResult, ReactivateOptionResult };

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
