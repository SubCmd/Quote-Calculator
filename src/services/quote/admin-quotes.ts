import type { QuoteStatus } from "@prisma/client";
import { formatPhone, maskName, maskPhone } from "@/lib/masking";
import {
  findQuoteDetail,
  findQuoteList,
  findQuoteStatus,
  logQuoteView,
  updateQuoteStatus,
} from "@/repositories/quote";
import { displayStatus } from "./expiry";
import { allowedTransitions, statusLabel, transitionError } from "./transition";
import type { SavedQuoteItem } from "./types";

export const PAGE_SIZE = 20;

export interface AdminQuoteListItem {
  publicId: string;
  /** 만료까지 반영한 표시 상태 (ADR-0012) */
  status: QuoteStatus;
  /** 목록에서는 마스킹한 값만 내보낸다. (`.claude/rules/admin.md`) */
  maskedName: string;
  maskedPhone: string;
  productName: string;
  totalAmount: number;
  calculatedAt: Date;
}

export interface AdminQuoteList {
  items: AdminQuoteListItem[];
  total: number;
  page: number;
  pageCount: number;
}

export async function listQuotes(
  page: number,
  status: QuoteStatus | null,
  now: Date,
): Promise<AdminQuoteList> {
  const { rows, total } = await findQuoteList(
    PAGE_SIZE,
    (page - 1) * PAGE_SIZE,
    status,
  );

  return {
    items: rows.map((row) => ({
      publicId: row.publicId,
      status: displayStatus(row.status, row.expiresAt, now),
      maskedName: maskName(row.customerName),
      maskedPhone: maskPhone(row.customerPhone),
      // 상품 조합은 한 번에 한 상품뿐이다. (ADR-0008 이후 결정)
      productName: row.productNames[0] ?? "—",
      totalAmount: row.totalAmount,
      calculatedAt: row.calculatedAt,
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export interface AdminQuoteDetail {
  publicId: string;
  /** 저장된 상태. 전이 판단은 이 값으로 한다. */
  storedStatus: QuoteStatus;
  /** 화면 표시용. 만료가 반영된다. */
  displayStatus: QuoteStatus;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  items: SavedQuoteItem[];
  subtotal: number;
  discountAmount: number;
  appliedDiscountName: string | null;
  totalAmount: number;
  calculatedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  /** 이 견적에서 지금 누를 수 있는 다음 상태 */
  nextStatuses: { value: QuoteStatus; label: string }[];
}

/**
 * 관리자 상세. 연락처를 전부 보여주므로 **열람 기록을 남긴다.** (`.claude/rules/admin.md`)
 * 금액은 저장된 값을 그대로 쓴다. 다시 계산하지 않는다. (ADR-0002)
 */
export async function getQuoteDetail(
  publicId: string,
  actor: string,
  now: Date,
): Promise<AdminQuoteDetail | null> {
  const quote = await findQuoteDetail(publicId);
  if (!quote) return null;

  await logQuoteView(publicId, actor);

  return {
    publicId: quote.publicId,
    storedStatus: quote.status,
    displayStatus: displayStatus(quote.status, quote.expiresAt, now),
    customerName: quote.customerName ?? "—",
    customerPhone: formatPhone(quote.customerPhone),
    customerEmail: quote.customerEmail ?? "—",
    items: quote.items,
    subtotal: quote.subtotal,
    discountAmount: quote.discountAmount,
    appliedDiscountName: quote.snapshot.appliedDiscount?.name ?? null,
    totalAmount: quote.totalAmount,
    calculatedAt: quote.calculatedAt,
    expiresAt: quote.expiresAt,
    createdAt: quote.createdAt,
    nextStatuses: allowedTransitions(quote.status).map((value) => ({
      value,
      label: statusLabel(value),
    })),
  };
}

export type ChangeStatusResult =
  | { ok: true; status: QuoteStatus }
  | {
      ok: false;
      /** API Route 가 상태 코드를 고를 수 있도록 사유를 구분해 둔다. */
      reason: "not-found" | "not-allowed" | "conflict";
      error: string;
    };

/**
 * 견적 상태 변경. 허용된 경로만 통과한다. (`docs/architecture.md` 6절)
 * 임의 상태 지정이 아니라 현재 상태에서의 전이로만 받는다.
 */
export async function changeQuoteStatus(
  publicId: string,
  to: QuoteStatus,
  actor: string,
): Promise<ChangeStatusResult> {
  const current = await findQuoteStatus(publicId);
  if (current === null)
    return {
      ok: false,
      reason: "not-found",
      error: "견적을 찾을 수 없습니다.",
    };

  const rejected = transitionError(current, to);
  if (rejected) return { ok: false, reason: "not-allowed", error: rejected };

  const changed = await updateQuoteStatus(
    publicId,
    current,
    to,
    actor,
    `견적 ${publicId} 상태 ${statusLabel(current)} → ${statusLabel(to)}`,
  );

  // 조회와 변경 사이에 누가 먼저 바꿨다. 덮어쓰지 않고 거부한다.
  if (!changed)
    return {
      ok: false,
      reason: "conflict",
      error:
        "다른 곳에서 상태가 먼저 변경되었습니다. 새로 고친 뒤 다시 시도해 주세요.",
    };

  return { ok: true, status: to };
}
