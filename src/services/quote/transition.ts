import type { QuoteStatus } from "@prisma/client";

/**
 * 허용되는 상태 전이. `docs/architecture.md` 6절이 기준이다.
 * `CONFIRMED`·`CANCELED` 는 종착 상태라 키가 없다.
 * `EXPIRED` 는 저장 상태가 아니므로 출발점도 도착점도 될 수 없다. (ADR-0012)
 */
const ALLOWED: Partial<Record<QuoteStatus, QuoteStatus[]>> = {
  DRAFT: ["REQUESTED"],
  REQUESTED: ["CONFIRMED", "CANCELED"],
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
