export type DiscountType = "FIXED" | "RATE";

export interface ProductRule {
  id: string;
  name: string;
}

export interface OptionGroupRule {
  id: string;
  name: string;
  required: boolean;
  /** true 면 그룹 내 1개만 선택 가능 */
  singleSelect: boolean;
  /** 이 그룹을 고르기 전에 선택이 있어야 하는 그룹. null 이면 제약 없음 (ADR-0010) */
  dependsOnGroupId: string | null;
}

export interface OptionRule {
  id: string;
  groupId: string;
  name: string;
  /** 선택 시 더해지는 금액(원, 부가세 포함) */
  amount: number;
  versionId: string;
}

export interface DiscountRule {
  id: string;
  name: string;
  type: DiscountType;
  /** FIXED: 할인 금액(원). RATE: 0 */
  amount: number;
  /** RATE: 만분율(15% = 1500). FIXED: 0 */
  rateBp: number;
  /**
   * 전부 선택해야 후보가 되는 옵션. 비어 있으면 항상 후보다. (ADR-0009)
   * Repository 가 옵션 코드를 현재 버전의 옵션 id 로 해석해서 채운다.
   */
  requiredOptionIds: string[];
  /** 할인액 동률 시 낮은 값이 우선 (ADR-0006) */
  priority: number;
  versionId: string;
}

/** 계산에 필요한 가격 규칙 모음. Repository 가 조회해서 넘긴다. */
export interface RuleSet {
  product: ProductRule;
  groups: OptionGroupRule[];
  options: OptionRule[];
  discounts: DiscountRule[];
}

export interface EstimateInput {
  productId: string;
  optionIds: string[];
}

export type ViolationCode =
  | "REQUIRED_GROUP_EMPTY"
  | "MULTIPLE_IN_SINGLE_GROUP"
  | "GROUP_PREREQUISITE_UNMET"
  | "UNKNOWN_OPTION"
  | "UNKNOWN_PRODUCT";

export interface Violation {
  code: ViolationCode;
  groupId?: string;
  optionIds?: string[];
  message: string;
}

export interface AppliedOption {
  optionId: string;
  name: string;
  /** 이 옵션이 더한 금액 */
  amount: number;
}

export interface CalculatedItem {
  productId: string;
  /** 선택 옵션 금액의 합. 버림 전 */
  optionAmount: number;
  /** 10원 단위 버림 적용 후 */
  subtotal: number;
  appliedOptions: AppliedOption[];
}

export interface DiscountCandidate {
  discountId: string;
  name: string;
  /** 버림 적용 전 할인액 */
  amount: number;
  priority: number;
}

export interface CalculationSuccess {
  ok: true;
  items: CalculatedItem[];
  subtotal: number;
  discountAmount: number;
  appliedDiscount: DiscountCandidate | null;
  discountCandidates: DiscountCandidate[];
  /** 부가세 포함 최종 금액 */
  totalAmount: number;
  pricingRuleVersionIds: string[];
  calculatedAt: Date;
}

export interface CalculationFailure {
  ok: false;
  violations: Violation[];
}

export type CalculationResult = CalculationSuccess | CalculationFailure;
