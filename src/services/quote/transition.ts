import type { QuoteStatus } from "@prisma/client";

/**
 * 허용되는 상태 전이. `docs/architecture.md` 6절이 기준이다.
 *
 * `CONFIRMED`·`CANCELED` 에서 `REQUESTED` 로 되돌릴 수 있다. (ADR-0034) 오조작을 고치는
 * 길이다. 둘이 직접 오가지는 못한다 — `REQUESTED` 를 거쳐야 거쳐 간 자리가 로그에 남는다.
 * `DRAFT` 로는 되돌릴 수 없다. 고객이 요청한 사실은 없던 일이 되지 않는다.
 *
 * `EXPIRED` 는 저장 상태가 아니므로 출발점도 도착점도 될 수 없다. (ADR-0012)
 */
const ALLOWED: Partial<Record<QuoteStatus, QuoteStatus[]>> = {
  DRAFT: ["REQUESTED"],
  REQUESTED: ["CONFIRMED", "CANCELED"],
  CONFIRMED: ["REQUESTED"],
  CANCELED: ["REQUESTED"],
};

export function allowedTransitions(from: QuoteStatus): QuoteStatus[] {
  return ALLOWED[from] ?? [];
}

export function canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  return allowedTransitions(from).includes(to);
}

const LABEL: Record<QuoteStatus, string> = {
  DRAFT: "작성 중",
  REQUESTED: "요청 접수",
  CONFIRMED: "확정",
  EXPIRED: "유효기간 지남",
  CANCELED: "취소",
};

export function statusLabel(status: QuoteStatus): string {
  return LABEL[status];
}

/**
 * 행을 지울 수 있는 상태. (ADR-0041)
 *
 * 확정 건은 `confirmedAt` 기준 5년 보존 의무가 있다. (ADR-0022) 요청 접수에서 멈춘 건과
 * 취소된 건은 거래가 성립하지 않았으므로 보존 대상이 아니다.
 *
 * `EXPIRED` 는 저장 상태가 아니다. (ADR-0012) 판정은 **저장된 상태**로 한다.
 * 유효기간이 지난 요청 접수 건은 화면에 `EXPIRED` 로 보이지만 지울 수 있다.
 *
 * `DRAFT` 는 지금 저장되지 않는 상태라서 목록에 나타나지 않는다. 생기면 여기를 다시 본다.
 */
export const DELETABLE_STATUSES: QuoteStatus[] = ["REQUESTED", "CANCELED"];

export function isDeletableStatus(status: QuoteStatus): boolean {
  return DELETABLE_STATUSES.includes(status);
}

/** 거부 사유. 화면에 그대로 보여 줄 수 있어야 한다. */
export function transitionError(
  from: QuoteStatus,
  to: QuoteStatus,
): string | null {
  if (canTransition(from, to)) return null;
  if (from === to) return `이미 '${LABEL[from]}' 상태입니다.`;
  if (allowedTransitions(from).length === 0)
    return `'${LABEL[from]}' 견적은 상태를 더 바꿀 수 없습니다.`;
  return `'${LABEL[from]}' 에서 '${LABEL[to]}' 로는 바꿀 수 없습니다.`;
}
