import type { QuoteStatus } from "@prisma/client";
import type { AppliedOption, DiscountCandidate } from "../pricing/types";

/** 저장 시 받는 고객 정보. 학생 정보는 받지 않는다. (ADR-0013) */
export interface CustomerInput {
  name: string;
  phone: string;
  email: string | null;
}

export interface SaveQuoteInput {
  productId: string;
  optionIds: string[];
  /** 고지를 읽고 동의했다는 표시. 검증을 통과한 요청에는 `true` 뿐이다. (ADR-0018) */
  privacyConsent: true;
  customer: CustomerInput;
}

/**
 * 계산 시점을 되살리기 위한 기록. 금액 컬럼으로 못 담는 값만 넣는다. (`.claude/rules/database.md`)
 * 가격 규칙이 새 버전으로 바뀌어도 이 값은 움직이지 않는다.
 */
export interface QuoteSnapshot {
  input: { productId: string; optionIds: string[] };
  appliedDiscount: DiscountCandidate | null;
  discountCandidates: DiscountCandidate[];
  pricingRuleVersionIds: string[];
  /** 복제본이면 원본 주소. 금액은 복제 시점 기준이라 원본과 다를 수 있다. (ADR-0014) */
  clonedFromPublicId?: string;
}

export interface SavedQuoteItem {
  productId: string;
  productName: string;
  optionAmount: number;
  subtotal: number;
  appliedOptions: AppliedOption[];
}

export interface SavedQuote {
  publicId: string;
  /** 저장된 상태가 아니라 만료까지 반영한 표시 상태다. (ADR-0012) */
  status: QuoteStatus;
  items: SavedQuoteItem[];
  subtotal: number;
  discountAmount: number;
  appliedDiscount: DiscountCandidate | null;
  totalAmount: number;
  calculatedAt: Date;
  expiresAt: Date;
}
