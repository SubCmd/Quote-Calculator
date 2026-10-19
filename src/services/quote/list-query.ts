import type { QuoteStatus } from "@prisma/client";
import { PAYMENT_METHOD_CHOICES } from "@/lib/payment-method";
import type { PaymentMethodFilter, QuoteSearch } from "./admin-quotes";
import { parseSearchRange } from "./search-range";

/**
 * 견적 목록 주소에 담기는 조건. (ADR-0050)
 *
 * 목록 화면과 CSV 내보내기가 **같은 함수로** 읽는다. 두 번 적으면 그것이 두 번째
 * 판정이 되고, 화면에서 좁힌 것과 파일에 담긴 것이 어긋난다. 어긋나도 아무 에러가
 * 나지 않아서 담당자는 알 수 없다. 조건 파싱 자체가 보안 경계다.
 */
export interface QuoteListQuery {
  status?: string;
  page?: string;
  name?: string;
  from?: string;
  to?: string;
  hidden?: string;
  product?: string;
  phone?: string;
  payment?: string;
}

/** 필터로 받을 수 있는 저장 상태. `EXPIRED` 는 저장되지 않으므로 조건이 될 수 없다. (ADR-0012) */
const FILTERABLE: QuoteStatus[] = ["REQUESTED", "CONFIRMED", "CANCELED"];

function parseStatus(raw: string | undefined): QuoteStatus | null {
  return FILTERABLE.find((status) => status === raw) ?? null;
}

/** 공백만 넣은 검색은 조건 없음이다. 전체 조회를 검색으로 기록하지 않는다. (ADR-0015) */
function parseText(raw: string | undefined): string | null {
  const text = raw?.trim();
  return text ? text : null;
}

/**
 * 결제 방식 조건. `none` 은 **고객이 아직 고르지 않은 건**이다. (ADR-0049)
 * 아는 값만 통과시킨다. 주소창에 적힌 글자를 그대로 조건으로 쓰지 않는다.
 */
function parsePaymentMethod(
  raw: string | undefined,
): PaymentMethodFilter | null {
  if (raw === "none") return "NONE";
  const found = PAYMENT_METHOD_CHOICES.find((choice) => choice.value === raw);
  return found?.value ?? null;
}

export function parseQuoteSearch(query: QuoteListQuery): QuoteSearch {
  const { from, until } = parseSearchRange(query.from, query.to);
  return {
    status: parseStatus(query.status),
    customerName: parseText(query.name),
    from,
    until,
    // 숨긴 견적은 따로 본다. 되돌릴 자리가 그 목록이다. (ADR-0035)
    hidden: query.hidden === "1",
    productCode: parseText(query.product),
    // 하이픈을 떼는 것은 Service 가 한다. 화면은 입력한 글자를 그대로 넘긴다. (ADR-0049)
    customerPhone: parseText(query.phone),
    paymentMethod: parsePaymentMethod(query.payment),
  };
}

/** 내보내기는 이 함수를 부르지 않는다. 파일에 페이지가 없다. (ADR-0050) */
export function parseQuotePage(raw: string | undefined): number {
  const page = Number(raw ?? "1");
  return Number.isInteger(page) && page > 0 ? page : 1;
}
