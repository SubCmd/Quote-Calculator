import type { PaymentMethod, QuoteStatus } from "@prisma/client";
import { toCsv } from "@/lib/csv";
import { formatPhone } from "@/lib/masking";
import { paymentMethodLabel } from "@/lib/payment-method";
import {
  findProductChoices,
  type ProductChoiceRow,
} from "@/repositories/product";
import type { PaymentMethodFilter } from "@/repositories/quote";
import {
  deleteQuotes,
  findQuoteDetail,
  findQuoteList,
  findQuoteStatus,
  findQuotesForBulkAction,
  findQuotesForExport,
  hideQuotes,
  logQuoteExport,
  logQuoteSearch,
  logQuoteView,
  setQuoteHidden,
  updateQuoteStatus,
} from "@/repositories/quote";
import { displayStatus } from "./expiry";
import {
  DELETABLE_STATUSES,
  allowedTransitions,
  isDeletableStatus,
  statusLabel,
  transitionError,
} from "./transition";
import type { SavedQuoteItem } from "./types";

export const PAGE_SIZE = 20;

// 화면이 Repository 를 import 하지 않도록 여기서 다시 내보낸다. (`.claude/rules/architecture.md`)
export type { PaymentMethodFilter, ProductChoiceRow };

export interface AdminQuoteListItem {
  publicId: string;
  /** 만료까지 반영한 표시 상태 (ADR-0012) */
  status: QuoteStatus;
  /** 목록도 연락처를 그대로 내보낸다. 가리지 않는다. (ADR-0047) */
  customerName: string;
  customerPhone: string;
  productName: string;
  totalAmount: number;
  calculatedAt: Date;
  /** 고객이 고른 결제 방식. 누구에게 연락할지 목록에서 바로 보인다. (ADR-0033) */
  paymentMethod: PaymentMethod | null;
  /** 숨긴 시각. 숨긴 견적 목록에서만 값이 있다. (ADR-0035) */
  hiddenAt: Date | null;
  /**
   * 행을 지울 수 있는 건인가. (ADR-0041) **저장된 상태**로 판정한 값이다.
   * 화면이 `status` 로 다시 판단하지 않는다. 그 칸은 만료가 반영된 표시 상태라서
   * 유효기간이 지난 요청 접수 건을 지울 수 없는 것으로 읽는다.
   */
  deletable: boolean;
}

export interface AdminQuoteList {
  items: AdminQuoteListItem[];
  total: number;
  page: number;
  pageCount: number;
}

/** 목록 검색 조건. 기간 경계 해석은 `search-range.ts` 가 한다. (ADR-0015) */
export interface QuoteSearch {
  status: QuoteStatus | null;
  customerName: string | null;
  from: Date | null;
  until: Date | null;
  /** `true` 면 숨긴 견적만 본다. 되돌릴 자리가 그 목록이다. (ADR-0035) */
  hidden: boolean;
  /** 이 상품이 들어간 견적만. 비활성 상품도 조건이 될 수 있다. (ADR-0049) */
  productCode: string | null;
  /** 입력한 연락처. 하이픈·공백이 섞여 들어온다. (ADR-0049) */
  customerPhone: string | null;
  /** `"NONE"` 은 고객이 아직 고르지 않은 건이다. `null` 은 조건 없음. */
  paymentMethod: PaymentMethodFilter | null;
}

/**
 * 번호는 숫자만 저장한다. 입력의 하이픈·공백을 떼어야 맞는다. (ADR-0049)
 * 숫자가 하나도 없으면 조건으로 쓰지 않는다. 빈 문자열은 모든 행에 맞는다.
 */
function phoneDigits(raw: string | null): string | null {
  if (raw === null) return null;
  const digits = raw.replace(/\D/g, "");
  return digits ? digits : null;
}

export async function listQuotes(
  page: number,
  search: QuoteSearch,
  actor: string,
  now: Date,
): Promise<AdminQuoteList> {
  const customerPhone = phoneDigits(search.customerPhone);

  const { rows, total } = await findQuoteList(PAGE_SIZE, (page - 1) * PAGE_SIZE, {
    ...search,
    customerPhone,
  });

  // 이름·번호로 찾아본 것 자체가 개인정보 조회다. (ADR-0015, ADR-0049)
  // 검색어는 넘기지 않는다. 기록할 것은 찾아봤다는 사실이다. (ADR-0022)
  if (search.customerName !== null || customerPhone !== null)
    await logQuoteSearch(total, actor);

  return {
    items: rows.map((row) => ({
      publicId: row.publicId,
      status: displayStatus(row.status, row.expiresAt, now),
      customerName: row.customerName ?? "—",
      customerPhone: formatPhone(row.customerPhone),
      // 상품 조합은 한 번에 한 상품뿐이다. (ADR-0008 이후 결정)
      productName: row.productNames[0] ?? "—",
      totalAmount: row.totalAmount,
      calculatedAt: row.calculatedAt,
      paymentMethod: row.paymentMethod,
      hiddenAt: row.hiddenAt,
      deletable: isDeletableStatus(row.status),
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/**
 * 상품 필터의 선택지. 비활성 상품도 들어간다. (ADR-0049)
 * 끈 상품의 과거 견적을 찾을 길이 없어지면 안 된다.
 */
export async function listProductChoices(): Promise<ProductChoiceRow[]> {
  return findProductChoices();
}

/**
 * 한 번에 내보낼 수 있는 행 수. (ADR-0050)
 * 상한 없는 조회를 두지 않는다. 숫자가 하나 적혀 있는 것과 없는 것은 다르다.
 */
export const EXPORT_LIMIT = 1000;

/**
 * `publicId` 를 담지 않는다. 그 값은 인증 없는 고객 링크의 주소라서(ADR-0013),
 * 목록 전체가 든 파일이 모든 고객의 견적을 여는 열쇠 묶음이 된다. (ADR-0050)
 */
const EXPORT_HEADER = [
  "요청일시",
  "상품",
  "고객명",
  "연락처",
  "총액",
  "결제 방식",
  "상태",
];

/** 엑셀이 날짜로 읽는 형태. 한국은 서머타임이 없어서 오프셋을 고정해도 된다. */
function exportDateTime(value: Date): string {
  // `sv-SE` 는 `YYYY-MM-DD HH:mm` 으로 찍는다. 자리를 손으로 조립하지 않는다.
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export type ExportQuotesResult =
  | { ok: true; csv: string; filename: string; count: number }
  | { ok: false; total: number; limit: number; error: string };

/**
 * 좁힌 조건의 목록을 CSV 한 장으로 만든다. (ADR-0050)
 *
 * **금액은 포맷하지 않는다.** `formatKRW` 를 부르지 않고 정수를 문자열로만 바꾼다.
 * 쉼표와 `원` 이 붙으면 엑셀에서 문자열이 되어 더해지지 않는다. 내보내기를 만든
 * 이유가 엑셀이 `SUM` 하게 하는 것이다.
 *
 * 연락처에는 하이픈을 넣는다. `01012345678` 을 엑셀이 숫자로 읽어 앞의 0 을 떼어 먹는다.
 */
export async function exportQuotes(
  search: QuoteSearch,
  actor: string,
  now: Date,
): Promise<ExportQuotesResult> {
  const customerPhone = phoneDigits(search.customerPhone);

  const { rows, total, exceeded } = await findQuotesForExport(
    { ...search, customerPhone },
    EXPORT_LIMIT,
  );

  if (exceeded)
    return {
      ok: false,
      total,
      limit: EXPORT_LIMIT,
      error: `조건에 맞는 견적이 ${total}건입니다. 한 번에 ${EXPORT_LIMIT}건까지 내보낼 수 있습니다. 기간을 좁혀 주세요.`,
    };

  const csv = toCsv(
    EXPORT_HEADER,
    rows.map((row) => [
      exportDateTime(row.calculatedAt),
      row.productNames[0] ?? "—",
      row.customerName ?? "—",
      formatPhone(row.customerPhone),
      String(row.totalAmount),
      row.paymentMethod ? paymentMethodLabel(row.paymentMethod) : "미선택",
      statusLabel(displayStatus(row.status, row.expiresAt, now)),
    ]),
  );

  // 검색 기록과 겹쳐 남기지 않는다. 한 동작에 로그는 하나다.
  await logQuoteExport(rows.length, actor);

  return {
    ok: true,
    csv,
    filename: `quotes-${exportDateTime(now).slice(0, 10).replace(/-/g, "")}.csv`,
    count: rows.length,
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
  /** 개인정보 수집·이용 동의 시각. `null` 이면 동의 절차 도입 전 견적이다. (ADR-0018) */
  privacyConsentAt: Date | null;
  /** 취소·환불 규정 동의 시각. `null` 이면 고지 도입 전 견적이다. (ADR-0042) */
  refundPolicyConsentAt: Date | null;
  /** 연락처를 비운 시각. 빈 연락처가 파기 때문인지 구분한다. (ADR-0022) */
  purgedAt: Date | null;
  items: SavedQuoteItem[];
  subtotal: number;
  discountAmount: number;
  appliedDiscountName: string | null;
  totalAmount: number;
  calculatedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  /** 복제본이면 원본 주소. 금액은 원본과 다를 수 있다. (ADR-0014) */
  clonedFromPublicId: string | null;
  /** 이 견적에서 지금 누를 수 있는 다음 상태 */
  nextStatuses: { value: QuoteStatus; label: string }[];
  /** 선택한 결제 방식. null이면 아직 선택되지 않음 */
  paymentMethod: PaymentMethod | null;
  /** 숨긴 시각. 값이 있으면 고객 링크가 닫혀 있다. (ADR-0035) */
  hiddenAt: Date | null;
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
    privacyConsentAt: quote.privacyConsentAt,
    refundPolicyConsentAt: quote.refundPolicyConsentAt,
    purgedAt: quote.purgedAt,
    items: quote.items,
    subtotal: quote.subtotal,
    discountAmount: quote.discountAmount,
    appliedDiscountName: quote.snapshot.appliedDiscount?.name ?? null,
    totalAmount: quote.totalAmount,
    calculatedAt: quote.calculatedAt,
    expiresAt: quote.expiresAt,
    createdAt: quote.createdAt,
    clonedFromPublicId: quote.snapshot.clonedFromPublicId ?? null,
    nextStatuses: allowedTransitions(quote.status).map((value) => ({
      value,
      label: statusLabel(value),
    })),
    paymentMethod: quote.paymentMethod,
    hiddenAt: quote.hiddenAt,
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

export type HideQuoteResult =
  | { ok: true; hidden: boolean }
  | { ok: false; reason: "not-found" | "conflict"; error: string };

/**
 * 목록에서 숨기기·되돌리기. 행을 지우지 않는다. (ADR-0035)
 * 숨기면 고객 링크도 함께 닫히고, 되돌리면 같은 `publicId` 가 다시 열린다.
 */
export async function setQuoteVisibility(
  publicId: string,
  hide: boolean,
  actor: string,
): Promise<HideQuoteResult> {
  // 숨긴 견적도 찾아야 한다. 되돌리는 요청이 그 상태에서 온다.
  const current = await findQuoteStatus(publicId);
  if (current === null)
    return {
      ok: false,
      reason: "not-found",
      error: "견적을 찾을 수 없습니다.",
    };

  const changed = await setQuoteHidden(
    publicId,
    hide,
    actor,
    `견적 ${publicId} ${hide ? "숨김" : "숨김 해제"}`,
  );

  // 이미 그 상태였다. 기록만 한 줄 더 남기지 않는다.
  if (!changed)
    return {
      ok: false,
      reason: "conflict",
      error: hide
        ? "이미 숨긴 견적입니다."
        : "숨겨져 있지 않은 견적입니다. 새로 고쳐 주세요.",
    };

  return { ok: true, hidden: hide };
}

export type BulkQuoteResult =
  | { ok: true; count: number }
  | {
      ok: false;
      reason: "not-found" | "blocked" | "conflict";
      error: string;
      /** 작업을 막은 건. 어느 건이 문제인지 적어야 다음 정리에서 또 걸리지 않는다. */
      blocked: string[];
    };

/** 목록이 낡아 고른 건이 더는 그 상태가 아니다. 부분 처리하지 않고 전부 거부한다. */
const STALE_LIST: Omit<Extract<BulkQuoteResult, { ok: false }>, "reason"> = {
  ok: false,
  error: "목록이 바뀌었습니다. 새로 고친 뒤 다시 골라 주세요.",
  blocked: [],
};

/**
 * 고른 견적을 한꺼번에 숨긴다. (ADR-0041)
 * 모든 상태에 쓸 수 있고 되돌릴 수 있다. 되돌리는 자리는 상세 화면이다. (ADR-0035)
 */
export async function bulkHideQuotes(
  publicIds: string[],
  actor: string,
): Promise<BulkQuoteResult> {
  const rows = await findQuotesForBulkAction(publicIds);

  if (rows.length !== publicIds.length)
    return { ...STALE_LIST, reason: "not-found" };

  const already = rows.filter((row) => row.hiddenAt !== null);
  if (already.length > 0)
    return {
      ok: false,
      reason: "conflict",
      error: "이미 숨겨진 견적이 선택에 들어 있습니다. 새로 고쳐 주세요.",
      blocked: already.map((row) => row.publicId),
    };

  const count = await hideQuotes(rows, actor);
  if (count === null) return { ...STALE_LIST, reason: "conflict" };

  return { ok: true, count };
}

/**
 * 고른 견적의 행을 실제로 지운다. 되돌릴 수 없다. (ADR-0041)
 *
 * 확정 건이 하나라도 섞이면 **아무것도 지우지 않는다.** 되는 것만 지우고 끝내면
 * 운영자는 고른 건수만큼 지워졌다고 읽고 넘어가고, 남은 건은 다음 정리에서 또 걸린다.
 */
export async function bulkDeleteQuotes(
  publicIds: string[],
  actor: string,
): Promise<BulkQuoteResult> {
  const rows = await findQuotesForBulkAction(publicIds);

  if (rows.length !== publicIds.length)
    return { ...STALE_LIST, reason: "not-found" };

  // 판정은 저장된 상태로 한다. 화면의 버튼 비활성은 보조일 뿐이다.
  const blocked = rows.filter((row) => !isDeletableStatus(row.status));
  if (blocked.length > 0)
    return {
      ok: false,
      reason: "blocked",
      error: `확정된 견적 ${blocked.length}건은 지울 수 없습니다. 보존 의무가 있어 숨기기만 가능합니다.`,
      blocked: blocked.map((row) => row.publicId),
    };

  const count = await deleteQuotes(rows, DELETABLE_STATUSES, actor);
  if (count === null) return { ...STALE_LIST, reason: "conflict" };

  return { ok: true, count };
}
