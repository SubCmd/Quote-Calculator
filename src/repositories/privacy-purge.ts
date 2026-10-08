import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PurgeCutoff } from "@/services/privacy/retention";

/** 파기 대상을 고르는 조건. 이미 비운 행(`purgedAt`)은 두 번 세지 않는다. (ADR-0022) */
function unconfirmedTargets(cutoff: PurgeCutoff): Prisma.QuoteWhereInput {
  return {
    status: { in: ["DRAFT", "REQUESTED", "CANCELED"] },
    createdAt: { lt: cutoff.unconfirmedBefore },
    purgedAt: null,
  };
}

/** `confirmedAt` 이 없는 과거 행은 기준점이 없으므로 건드리지 않는다. 마이그레이션이 백필한다. */
function confirmedTargets(cutoff: PurgeCutoff): Prisma.QuoteWhereInput {
  return {
    status: "CONFIRMED",
    confirmedAt: { lt: cutoff.confirmedBefore },
    purgedAt: null,
  };
}

function searchLogTargets(cutoff: PurgeCutoff): Prisma.AuditLogWhereInput {
  return {
    action: "QUOTE_SEARCHED",
    createdAt: { lt: cutoff.searchLogBefore },
    // 이미 가린 행은 다시 고르지 않는다. 가린 행의 targetId 는 항상 이 값이다.
    targetId: { not: MASKED_SEARCH_TERM },
  };
}

/** 가려진 검색어 자리에 들어가는 고정값. 원래 값을 되돌릴 수 없다. */
export const MASKED_SEARCH_TERM = "(파기됨)";

export interface PurgeCounts {
  unconfirmed: number;
  confirmed: number;
  searchLogs: number;
}

/** 지우지 않고 대상 건수만 센다. `--dry` 가 쓴다. */
export async function countPurgeTargets(
  cutoff: PurgeCutoff,
): Promise<PurgeCounts> {
  const [unconfirmed, confirmed, searchLogs] = await Promise.all([
    prisma.quote.count({ where: unconfirmedTargets(cutoff) }),
    prisma.quote.count({ where: confirmedTargets(cutoff) }),
    prisma.auditLog.count({ where: searchLogTargets(cutoff) }),
  ]);

  return { unconfirmed, confirmed, searchLogs };
}

/**
 * 연락처 컬럼을 비우고 감사 로그를 남긴다. 둘은 같은 트랜잭션이다.
 * (`.claude/rules/admin.md` — 기록과 본 작업은 같은 트랜잭션에서 수행한다)
 *
 * 금액·선택 내역·`snapshot`·`privacyConsentAt` 은 건드리지 않는다. (ADR-0022)
 * 감사 로그에 **지운 값을 담지 않는다.** 담으면 파기한 자리에 다시 쌓인다.
 */
export async function purgeExpiredPersonalData(
  cutoff: PurgeCutoff,
  now: Date,
  actor: string,
): Promise<PurgeCounts> {
  return prisma.$transaction(async (tx) => {
    const cleared = {
      customerName: null,
      customerPhone: null,
      customerEmail: null,
      purgedAt: now,
    };

    const unconfirmed = await tx.quote.updateMany({
      where: unconfirmedTargets(cutoff),
      data: cleared,
    });

    const confirmed = await tx.quote.updateMany({
      where: confirmedTargets(cutoff),
      data: cleared,
    });

    const searchLogs = await tx.auditLog.updateMany({
      where: searchLogTargets(cutoff),
      data: {
        targetId: MASKED_SEARCH_TERM,
        summary: `고객명 검색 기록 (검색어 파기됨)`,
      },
    });

    const counts: PurgeCounts = {
      unconfirmed: unconfirmed.count,
      confirmed: confirmed.count,
      searchLogs: searchLogs.count,
    };

    // 아무것도 안 지웠으면 기록도 남기지 않는다. 매일 도는 배치가 빈 줄을 쌓는다.
    if (counts.unconfirmed + counts.confirmed + counts.searchLogs > 0) {
      await tx.auditLog.create({
        data: {
          action: "PRIVACY_PURGED",
          actor,
          summary:
            `보존기간 경과 개인정보 파기 — ` +
            `미확정 ${counts.unconfirmed}건 · 확정 ${counts.confirmed}건 · ` +
            `검색 기록 ${counts.searchLogs}건`,
          targetType: "PrivacyPurge",
          targetId: now.toISOString(),
          afterValue: counts as unknown as Prisma.InputJsonValue,
        },
      });
    }

    return counts;
  });
}
