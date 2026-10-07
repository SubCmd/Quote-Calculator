import type { QuoteStatus } from "@prisma/client";

/** 견적 유효기간. 바꾸면 **이후에 발행되는** 견적부터 적용된다. (ADR-0012) */
export const QUOTE_VALIDITY_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export function expiresAtFrom(calculatedAt: Date): Date {
  return new Date(calculatedAt.getTime() + QUOTE_VALIDITY_DAYS * DAY_MS);
}

/**
 * 화면에 보여 줄 상태. `EXPIRED` 는 DB 에 저장하지 않고 여기서 파생한다. (ADR-0012)
 * 확정된 견적은 만료되지 않는다. (CLAUDE.md 6번)
 */
export function displayStatus(
  stored: QuoteStatus,
  expiresAt: Date,
  now: Date,
): QuoteStatus {
  if (stored === "CONFIRMED" || stored === "CANCELED") return stored;
  return expiresAt.getTime() <= now.getTime() ? "EXPIRED" : stored;
}
