import type { QuoteStatus } from "@prisma/client";
import type { FailureWindow } from "@/lib/attempt-window";
import { prisma } from "@/lib/prisma";

/**
 * 고객 플랜 조회. (ADR-0045)
 * 업무 판단은 하지 않는다. 한도·창 길이·상태 표기는 Service 의 일이다.
 */

/**
 * 한 번에 돌려주는 최대 건수. 무제한 조회를 만들지 않는다. (`.claude/rules/database.md`)
 * 한 사람이 요청한 플랜이 이보다 많은 경우는 없다. 더 있으면 최근 것부터 잘린다.
 */
export const LOOKUP_RESULT_LIMIT = 20;

/** 조회 결과 한 줄. **연락처를 담지 않는다.** 맞힌 사람에게도 되돌려 적지 않는다. (ADR-0045 §3) */
export interface LookupQuoteRow {
  publicId: string;
  status: QuoteStatus;
  totalAmount: number;
  calculatedAt: Date;
  expiresAt: Date;
  productNames: string[];
}

/**
 * 이름과 전화번호가 **둘 다 정확히** 일치하는 플랜. 부분 일치를 쓰지 않는다.
 * 관리자 목록의 이름 검색(ADR-0015)과 다른 질의다. 저쪽은 로그인한 사람이 훑는 것이고
 * 이쪽은 인증 없는 공개 경로라서, 같은 질의를 쓰면 한 글자로 전체 명단이 열린다.
 *
 * `hiddenAt` 이 있는 플랜은 제외한다. 관리자가 닫은 플랜의 고객 링크도 함께 닫힌다. (ADR-0035)
 * 파기된 플랜(ADR-0022)은 연락처가 `null` 이라 자연히 걸리지 않는다.
 */
export async function findQuotesByCustomer(
  name: string,
  phone: string,
): Promise<LookupQuoteRow[]> {
  const rows = await prisma.quote.findMany({
    where: { customerName: name, customerPhone: phone, hiddenAt: null },
    orderBy: { calculatedAt: "desc" },
    take: LOOKUP_RESULT_LIMIT,
    select: {
      publicId: true,
      status: true,
      totalAmount: true,
      calculatedAt: true,
      expiresAt: true,
      items: { select: { product: { select: { name: true } } } },
    },
  });

  return rows.map((row) => ({
    publicId: row.publicId,
    status: row.status,
    totalAmount: row.totalAmount,
    calculatedAt: row.calculatedAt,
    expiresAt: row.expiresAt,
    productNames: row.items.map((item) => item.product.name),
  }));
}

/** 실패 1건을 남긴다. 잠긴 요청에는 부르지 않는다. (ADR-0045 §6) */
export async function recordLookupFailure(ip: string): Promise<void> {
  await prisma.quoteLookupAttempt.create({ data: { ip } });
}

/** 판정에 쓰이지 않는 오래된 행을 지운다. 보존 의무가 없는 데이터다. */
export async function deleteLookupFailuresBefore(cutoff: Date): Promise<void> {
  await prisma.quoteLookupAttempt.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
}

/** `since` 이후 같은 IP 의 실패 건수와 가장 최근 실패 시각. 전체 집계는 세지 않는다. */
export async function findLookupFailureWindow(
  since: Date,
  ip: string,
): Promise<FailureWindow> {
  const result = await prisma.quoteLookupAttempt.aggregate({
    where: { createdAt: { gte: since }, ip },
    _count: { _all: true },
    _max: { createdAt: true },
  });

  return { count: result._count._all, newestAt: result._max.createdAt };
}

/**
 * 조회 사실만 남긴다. **이름·전화번호를 담지 않는다.** (ADR-0045 §7)
 *
 * 남겨야 하는 것은 "누군가 조회를 시도했고 몇 건이 나왔다" 는 사실이지 그 조회어가 아니다.
 * 저장하지 않으면 파기할 것도 없다. (ADR-0015, ADR-0022, ADR-0041 과 같은 선)
 * 0건도 남긴다. 못 찾은 시도가 쌓이는 것이 읽어야 할 신호다.
 */
export async function logQuoteLookup(matched: number): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: "QUOTE_LOOKED_UP",
      actor: "customer",
      summary: `이름·휴대전화번호로 플랜 조회 (${matched}건)`,
      targetType: "QuoteLookup",
      targetId: "-",
    },
  });
}
