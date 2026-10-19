import { randomBytes } from "node:crypto";
import type { Prisma, PaymentMethod, QuoteStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AppliedOption } from "@/services/pricing/types";
import type {
  CustomerInput,
  QuoteSnapshot,
  SavedQuoteItem,
} from "@/services/quote/types";

export interface CreateQuoteInput {
  customer: CustomerInput;
  /** 개인정보 수집·이용 동의 시각. 복제본은 원본 값을 승계한다. (ADR-0018) */
  privacyConsentAt: Date | null;
  /** 취소·환불 규정 동의 시각. 복제본은 원본 값을 승계한다. (ADR-0042) */
  refundPolicyConsentAt: Date | null;
  items: {
    productId: string;
    optionAmount: number;
    subtotal: number;
    appliedOptions: AppliedOption[];
  }[];
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  appliedDiscountId: string | null;
  snapshot: QuoteSnapshot;
  calculatedAt: Date;
  expiresAt: Date;
}

/** Prisma 의 Json 입력 타입은 인터페이스를 받지 않는다. 변환은 이 레이어에 가둔다. */
function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export interface QuoteRow {
  publicId: string;
  status: QuoteStatus;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  snapshot: QuoteSnapshot;
  calculatedAt: Date;
  expiresAt: Date;
  items: SavedQuoteItem[];
  paymentMethod: PaymentMethod | null;
}

/**
 * 조회 URL 에 그대로 실리고 인증이 없다. 추측 가능하면 남의 견적이 열린다.
 * 순번이나 cuid 처럼 규칙이 보이는 값을 쓰지 않는다. (ADR-0013)
 */
function newPublicId(): string {
  return randomBytes(16).toString("base64url");
}

function quoteCreateData(input: CreateQuoteInput): Prisma.QuoteCreateInput {
  return {
    publicId: newPublicId(),
    status: "REQUESTED",
    customerName: input.customer.name,
    customerPhone: input.customer.phone,
    customerEmail: input.customer.email,
    privacyConsentAt: input.privacyConsentAt,
    refundPolicyConsentAt: input.refundPolicyConsentAt,
    subtotal: input.subtotal,
    discountAmount: input.discountAmount,
    totalAmount: input.totalAmount,
    appliedDiscountId: input.appliedDiscountId,
    snapshot: asJson(input.snapshot),
    calculatedAt: input.calculatedAt,
    expiresAt: input.expiresAt,
    items: {
      create: input.items.map((item) => ({
        ...item,
        appliedOptions: asJson(item.appliedOptions),
      })),
    },
  };
}

export async function createQuote(input: CreateQuoteInput): Promise<string> {
  const quote = await prisma.quote.create({
    data: quoteCreateData(input),
    select: { publicId: true },
  });

  return quote.publicId;
}

/**
 * 복제본 생성과 감사 기록을 같은 트랜잭션에서 수행한다. (`.claude/rules/admin.md`)
 * 원본 행은 읽지도 쓰지도 않는다. 복제로 원본이 달라지지 않는다. (ADR-0014)
 */
export async function createClonedQuote(
  input: CreateQuoteInput,
  from: { publicId: string; totalAmount: number },
  actor: string,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.quote.create({
      data: quoteCreateData(input),
      select: { publicId: true },
    });

    await tx.auditLog.create({
      data: {
        action: "QUOTE_CLONED",
        actor,
        summary: `견적 ${from.publicId} 복제 → ${quote.publicId} (연락처 승계, 금액 재계산)`,
        targetType: "Quote",
        targetId: quote.publicId,
        beforeValue: {
          publicId: from.publicId,
          totalAmount: from.totalAmount,
        },
        afterValue: {
          publicId: quote.publicId,
          totalAmount: input.totalAmount,
        },
      },
    });

    return quote.publicId;
  });
}

/**
 * 고객 조회용. 개인정보 컬럼은 꺼내지 않는다. (`.claude/rules/database.md`)
 * 숨긴 견적은 없는 것으로 다룬다. 그래서 `/q/[publicId]` 와 인쇄 화면이 함께 닫힌다. (ADR-0035)
 */
export async function findQuoteByPublicId(
  publicId: string,
): Promise<QuoteRow | null> {
  const quote = await prisma.quote.findFirst({
    where: { publicId, hiddenAt: null },
    select: {
      publicId: true,
      status: true,
      subtotal: true,
      discountAmount: true,
      totalAmount: true,
      snapshot: true,
      calculatedAt: true,
      expiresAt: true,
      paymentMethod: true,
      items: {
        select: {
          productId: true,
          optionAmount: true,
          subtotal: true,
          appliedOptions: true,
          product: { select: { name: true } },
        },
      },
    },
  });

  if (!quote) return null;

  return {
    publicId: quote.publicId,
    status: quote.status,
    subtotal: quote.subtotal,
    discountAmount: quote.discountAmount,
    totalAmount: quote.totalAmount,
    snapshot: quote.snapshot as unknown as QuoteSnapshot,
    calculatedAt: quote.calculatedAt,
    expiresAt: quote.expiresAt,
    paymentMethod: quote.paymentMethod,
    items: quote.items.map((item) => ({
      productId: item.productId,
      productName: item.product.name,
      optionAmount: item.optionAmount,
      subtotal: item.subtotal,
      appliedOptions:
        item.appliedOptions as unknown as SavedQuoteItem["appliedOptions"],
    })),
  };
}

export interface QuoteListRow {
  publicId: string;
  status: QuoteStatus;
  customerName: string | null;
  customerPhone: string | null;
  totalAmount: number;
  calculatedAt: Date;
  expiresAt: Date;
  productNames: string[];
  /** 고객이 고른 결제 방식. 누구에게 연락할지 목록에서 바로 보인다. (ADR-0033) */
  paymentMethod: PaymentMethod | null;
  /** 숨긴 시각. 숨긴 견적 목록에서만 값이 있다. (ADR-0035) */
  hiddenAt: Date | null;
}

export interface QuoteListPage {
  rows: QuoteListRow[];
  total: number;
}

/**
 * 결제 방식 조건. `"NONE"` 은 **고객이 아직 고르지 않은 건**이고 `null` 은 조건 없음이다.
 * 둘을 한 값으로 묶으면 `미선택` 을 찾을 수 없다. (ADR-0049)
 */
export type PaymentMethodFilter = PaymentMethod | "NONE";

/** 목록 검색 조건. 기간은 `calculatedAt` 기준이다. (ADR-0015) */
export interface QuoteListFilter {
  status: QuoteStatus | null;
  /** `true` 면 숨긴 견적만 본다. 기본은 숨긴 것을 제외한 목록이다. (ADR-0035) */
  hidden: boolean;
  /** 고객명 부분 일치. 빈 값이면 조건 없음 */
  customerName: string | null;
  from: Date | null;
  /** 이 시각 **미만** */
  until: Date | null;
  /** 이 상품이 들어간 견적만. 비활성 상품도 조건이 될 수 있다. (ADR-0049) */
  productCode: string | null;
  /** 연락처 숫자 부분 일치. 하이픈을 떼는 것은 Service 의 몫이다. (ADR-0049) */
  customerPhone: string | null;
  paymentMethod: PaymentMethodFilter | null;
}

function quoteListWhere(filter: QuoteListFilter): Prisma.QuoteWhereInput {
  const calculatedAt: Prisma.DateTimeFilter = {};
  if (filter.from) calculatedAt.gte = filter.from;
  if (filter.until) calculatedAt.lt = filter.until;

  return {
    // 숨긴 것과 보이는 것을 한 목록에 섞지 않는다. (ADR-0035)
    hiddenAt: filter.hidden ? { not: null } : null,
    ...(filter.status === null ? {} : { status: filter.status }),
    ...(filter.customerName === null
      ? {}
      : {
          customerName: { contains: filter.customerName, mode: "insensitive" },
        }),
    ...(filter.from || filter.until ? { calculatedAt } : {}),
    // 상품 조합은 한 번에 한 상품뿐이지만 조건은 `some` 으로 적는다. (ADR-0008 이후 결정)
    ...(filter.productCode === null
      ? {}
      : { items: { some: { product: { code: filter.productCode } } } }),
    // 번호는 숫자만 저장한다. 들어온 값도 숫자만이어야 맞는다.
    ...(filter.customerPhone === null
      ? {}
      : { customerPhone: { contains: filter.customerPhone } }),
    ...(filter.paymentMethod === null
      ? {}
      : {
          paymentMethod:
            filter.paymentMethod === "NONE" ? null : filter.paymentMethod,
        }),
  };
}

/**
 * 관리자 목록. 무제한 조회를 만들지 않는다. (`.claude/rules/database.md`)
 * 이름·번호를 그대로 꺼내 온다. 관리자 화면은 가리지 않는다. (ADR-0047)
 */
export async function findQuoteList(
  take: number,
  skip: number,
  filter: QuoteListFilter,
): Promise<QuoteListPage> {
  const where = quoteListWhere(filter);

  const [rows, total] = await prisma.$transaction([
    prisma.quote.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      select: {
        publicId: true,
        status: true,
        customerName: true,
        customerPhone: true,
        totalAmount: true,
        calculatedAt: true,
        expiresAt: true,
        paymentMethod: true,
        hiddenAt: true,
        items: { select: { product: { select: { name: true } } } },
      },
    }),
    prisma.quote.count({ where }),
  ]);

  return {
    rows: rows.map((quote) => ({
      publicId: quote.publicId,
      status: quote.status,
      customerName: quote.customerName,
      customerPhone: quote.customerPhone,
      totalAmount: quote.totalAmount,
      calculatedAt: quote.calculatedAt,
      expiresAt: quote.expiresAt,
      paymentMethod: quote.paymentMethod,
      hiddenAt: quote.hiddenAt,
      productNames: quote.items.map((item) => item.product.name),
    })),
    total,
  };
}

export interface QuoteExportPage {
  /** 상한을 넘으면 비어 있다. 건수만 보고 사유를 돌려준다. */
  rows: QuoteListRow[];
  total: number;
  exceeded: boolean;
}

/**
 * CSV 내보내기 조회. (ADR-0050)
 *
 * 목록과 **같은 `where`** 를 쓴다. 화면에서 좁힌 것과 파일에 담긴 것이 어긋나면
 * 아무 에러도 나지 않고 담당자는 알 수 없다.
 *
 * 페이지가 없는 대신 **상한이 있다.** 먼저 건수를 세고 넘으면 행을 읽지 않는다.
 * 상한 없는 `findMany` 를 두지 않는다는 규칙은 그대로다. (`.claude/rules/database.md`)
 */
export async function findQuotesForExport(
  filter: QuoteListFilter,
  limit: number,
): Promise<QuoteExportPage> {
  const where = quoteListWhere(filter);

  const total = await prisma.quote.count({ where });
  if (total > limit) return { rows: [], total, exceeded: true };

  const rows = await prisma.quote.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      publicId: true,
      status: true,
      customerName: true,
      customerPhone: true,
      totalAmount: true,
      calculatedAt: true,
      expiresAt: true,
      paymentMethod: true,
      hiddenAt: true,
      items: { select: { product: { select: { name: true } } } },
    },
  });

  return {
    rows: rows.map((quote) => ({
      publicId: quote.publicId,
      status: quote.status,
      customerName: quote.customerName,
      customerPhone: quote.customerPhone,
      totalAmount: quote.totalAmount,
      calculatedAt: quote.calculatedAt,
      expiresAt: quote.expiresAt,
      paymentMethod: quote.paymentMethod,
      hiddenAt: quote.hiddenAt,
      productNames: quote.items.map((item) => item.product.name),
    })),
    total,
    exceeded: false,
  };
}

export interface QuoteDetailRow extends QuoteRow {
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  /** `null` 이면 동의 절차 도입(ADR-0018) 전에 만들어진 견적이다. */
  privacyConsentAt: Date | null;
  /** `null` 이면 환불 규정 고지 도입(ADR-0042) 전에 만들어진 견적이다. */
  refundPolicyConsentAt: Date | null;
  /** 연락처를 비운 시각. 빈 연락처가 파기 때문인지 구분한다. (ADR-0022) */
  purgedAt: Date | null;
  createdAt: Date;
  paymentMethod: PaymentMethod | null;
  /** 숨긴 시각. 관리자 상세는 숨긴 견적도 보여준다. 되돌릴 자리가 거기다. (ADR-0035) */
  hiddenAt: Date | null;
}

/** 상세 조회. 개인정보를 꺼내므로 호출하는 쪽에서 열람 로그를 남긴다. */
export async function findQuoteDetail(
  publicId: string,
): Promise<QuoteDetailRow | null> {
  const quote = await prisma.quote.findUnique({
    where: { publicId },
    include: {
      items: {
        select: {
          productId: true,
          optionAmount: true,
          subtotal: true,
          appliedOptions: true,
          product: { select: { name: true } },
        },
      },
    },
  });

  if (!quote) return null;

  return {
    publicId: quote.publicId,
    status: quote.status,
    customerName: quote.customerName,
    customerPhone: quote.customerPhone,
    customerEmail: quote.customerEmail,
    privacyConsentAt: quote.privacyConsentAt,
    refundPolicyConsentAt: quote.refundPolicyConsentAt,
    purgedAt: quote.purgedAt,
    subtotal: quote.subtotal,
    discountAmount: quote.discountAmount,
    totalAmount: quote.totalAmount,
    snapshot: quote.snapshot as unknown as QuoteSnapshot,
    calculatedAt: quote.calculatedAt,
    expiresAt: quote.expiresAt,
    createdAt: quote.createdAt,
    paymentMethod: quote.paymentMethod,
    hiddenAt: quote.hiddenAt,
    items: quote.items.map((item) => ({
      productId: item.productId,
      productName: item.product.name,
      optionAmount: item.optionAmount,
      subtotal: item.subtotal,
      appliedOptions:
        item.appliedOptions as unknown as SavedQuoteItem["appliedOptions"],
    })),
  };
}

/** 전이 판단에 필요한 것은 현재 상태뿐이다. 개인정보까지 끌어오지 않는다. */
export async function findQuoteStatus(
  publicId: string,
): Promise<QuoteStatus | null> {
  const quote = await prisma.quote.findUnique({
    where: { publicId },
    select: { status: true },
  });
  return quote?.status ?? null;
}

/**
 * 고객 요청에서 쓰는 상태 조회. 숨긴 견적은 없는 것으로 다룬다. (ADR-0035)
 * 관리자용 `findQuoteStatus` 와 가른 이유는, 숨겨 둔 견적의 상태는 관리자가
 * 되돌리기 전에도 읽어야 하지만 고객에게는 그 견적이 존재하지 않아야 하기 때문이다.
 */
export async function findVisibleQuoteStatus(
  publicId: string,
): Promise<QuoteStatus | null> {
  const quote = await prisma.quote.findFirst({
    where: { publicId, hiddenAt: null },
    select: { status: true },
  });
  return quote?.status ?? null;
}

/**
 * 목록에서 숨기기·되돌리기. 행을 지우지 않는다. (ADR-0035)
 * `where` 에 이전 `hiddenAt` 상태를 함께 걸어 두면 같은 버튼을 두 번 눌렀을 때
 * 두 번째가 기록만 더 남기지 않는다.
 */
export async function setQuoteHidden(
  publicId: string,
  hide: boolean,
  actor: string,
  summary: string,
): Promise<boolean> {
  const hiddenAt = hide ? new Date() : null;

  return prisma.$transaction(async (tx) => {
    const changed = await tx.quote.updateMany({
      where: { publicId, hiddenAt: hide ? null : { not: null } },
      data: { hiddenAt },
    });

    if (changed.count === 0) return false;

    await tx.auditLog.create({
      data: {
        action: hide ? "QUOTE_HIDDEN" : "QUOTE_RESTORED",
        actor,
        summary,
        targetType: "Quote",
        targetId: publicId,
        beforeValue: { hidden: !hide },
        afterValue: { hidden: hide },
      },
    });

    return true;
  });
}

/** 일괄 작업 대상 한 줄. 연락처는 담지 않는다. 감사 로그에 들어갈 값이다. (ADR-0041) */
export interface BulkQuoteRow {
  publicId: string;
  status: QuoteStatus;
  hiddenAt: Date | null;
  totalAmount: number;
  productNames: string[];
}

/**
 * 일괄 작업 전에 고른 건의 상태를 읽는다. (ADR-0041)
 * 어느 건이 삭제 불가인지 판단하고 감사 로그 문구를 만드는 데 쓴다.
 * 숨긴 건도 함께 읽는다. 목록이 낡아 이미 숨겨진 건이 선택에 들어올 수 있다.
 */
export async function findQuotesForBulkAction(
  publicIds: string[],
): Promise<BulkQuoteRow[]> {
  const rows = await prisma.quote.findMany({
    where: { publicId: { in: publicIds } },
    select: {
      publicId: true,
      status: true,
      hiddenAt: true,
      totalAmount: true,
      items: { select: { product: { select: { name: true } } } },
    },
  });

  return rows.map((row) => ({
    publicId: row.publicId,
    status: row.status,
    hiddenAt: row.hiddenAt,
    totalAmount: row.totalAmount,
    productNames: row.items.map((item) => item.product.name),
  }));
}

/**
 * 읽은 뒤 쓰는 사이에 다른 창이 먼저 바꾼 경우. 트랜잭션을 되돌리려면 던져야 해서
 * 센티넬로 던지고 바로 밖에서 잡는다. 부분 처리로 끝내지 않는다. (ADR-0041)
 */
const RACED = Symbol("raced");

function bulkAuditData(
  rows: BulkQuoteRow[],
  action: "QUOTE_HIDDEN" | "QUOTE_DELETED",
  actor: string,
): Prisma.AuditLogCreateManyInput[] {
  return rows.map((row) => ({
    action,
    actor,
    summary: `견적 ${row.publicId} ${action === "QUOTE_HIDDEN" ? "숨김" : "삭제"} · ${row.productNames.join(", ")} · ${row.totalAmount}원`,
    targetType: "Quote",
    targetId: row.publicId,
    beforeValue: asJson({ status: row.status, hidden: row.hiddenAt !== null }),
    afterValue: asJson(
      action === "QUOTE_HIDDEN" ? { hidden: true } : { deleted: true },
    ),
  }));
}

/**
 * 고른 건을 한꺼번에 숨긴다. 행은 지우지 않는다. (ADR-0035, ADR-0041)
 * `where` 에 `hiddenAt: null` 을 걸어 이미 숨긴 건을 두 번 기록하지 않는다.
 * 요청한 수와 바뀐 수가 다르면 전부 되돌린다. "n건 숨겼다" 가 거짓이 되면 안 된다.
 */
export async function hideQuotes(
  rows: BulkQuoteRow[],
  actor: string,
): Promise<number | null> {
  const publicIds = rows.map((row) => row.publicId);

  try {
    return await prisma.$transaction(async (tx) => {
      const changed = await tx.quote.updateMany({
        where: { publicId: { in: publicIds }, hiddenAt: null },
        data: { hiddenAt: new Date() },
      });

      if (changed.count !== publicIds.length) throw RACED;

      await tx.auditLog.createMany({
        data: bulkAuditData(rows, "QUOTE_HIDDEN", actor),
      });

      return changed.count;
    });
  } catch (error) {
    if (error === RACED) return null;
    throw error;
  }
}

/**
 * 고른 건의 행을 실제로 지운다. (ADR-0041)
 * `where` 에 상태 조건을 함께 걸어 확정 건이 지워지는 경로를 DB 쪽에서도 막는다.
 * 어느 상태를 지울 수 있는지는 Service 가 정한다(`transition.ts`). 여기서는 그 목록을
 * 조건에 넣는 일만 한다. 보존 의무 판단을 Repository 에 적지 않는다.
 * 감사 로그를 먼저 쓴다. 행은 사라지지만 지웠다는 사실은 남아야 한다.
 * `QuoteItem` 은 외래 키 `onDelete: Cascade` 로 함께 지워진다.
 */
export async function deleteQuotes(
  rows: BulkQuoteRow[],
  deletableStatuses: QuoteStatus[],
  actor: string,
): Promise<number | null> {
  const publicIds = rows.map((row) => row.publicId);

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.auditLog.createMany({
        data: bulkAuditData(rows, "QUOTE_DELETED", actor),
      });

      const removed = await tx.quote.deleteMany({
        where: {
          publicId: { in: publicIds },
          status: { in: deletableStatuses },
        },
      });

      if (removed.count !== publicIds.length) throw RACED;

      return removed.count;
    });
  } catch (error) {
    if (error === RACED) return null;
    throw error;
  }
}

/**
 * 상태 변경과 감사 기록을 같은 트랜잭션에서 수행한다. (`.claude/rules/admin.md`)
 * `where` 에 이전 상태를 함께 걸어 두면 그 사이 누가 먼저 바꿨을 때 덮어쓰지 않는다.
 * 금액·선택 내역 컬럼은 건드리지 않는다. (CLAUDE.md 6번)
 */
export async function updateQuoteStatus(
  publicId: string,
  from: QuoteStatus,
  to: QuoteStatus,
  actor: string,
  summary: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const changed = await tx.quote.updateMany({
      where: { publicId, status: from },
      // 확정 시각은 보존기간 5년의 기준점이라 전이와 같은 트랜잭션에서 찍는다. (ADR-0022)
      // 되돌릴 때 비우는 것도 같은 이유다. 확정이 아닌 견적이 확정 시각을 들고 있으면
      // 보존기간을 셀 때 상태와 시각 중 어느 쪽을 믿어야 할지 알 수 없다. (ADR-0034)
      data: {
        status: to,
        ...(to === "CONFIRMED" ? { confirmedAt: new Date() } : {}),
        ...(from === "CONFIRMED" ? { confirmedAt: null } : {}),
      },
    });

    if (changed.count === 0) return false;

    await tx.auditLog.create({
      data: {
        action: "QUOTE_STATUS_CHANGED",
        actor,
        summary,
        targetType: "Quote",
        targetId: publicId,
        beforeValue: { status: from },
        afterValue: { status: to },
      },
    });

    return true;
  });
}

/**
 * 고객명 검색 기록. 이름으로 훑어보는 것도 개인정보 조회다. (ADR-0015)
 * 상태·기간만으로 거르는 조회는 대상이 아니므로 호출하지 않는다.
 *
 * **검색어는 남기지 않는다.** 남겨야 하는 것은 "담당자가 이름으로 훑어봤다"는 사실이지
 * 그 이름이 아니다. 저장하지 않으면 파기할 것도 없다. (ADR-0022)
 */
export async function logQuoteSearch(
  matched: number,
  actor: string,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: "QUOTE_SEARCHED",
      actor,
      summary: `고객명으로 견적 검색 (${matched}건)`,
      targetType: "QuoteSearch",
      targetId: "-",
    },
  });
}

/**
 * CSV 내보내기 기록. (ADR-0050)
 *
 * `QUOTE_SEARCHED` 와 묶지 않는다. 목록에서 **읽은 것과 내려받은 것**은 유출 경위를
 * 따질 때 구분돼야 한다. 검색 기록과 겹쳐 남기지도 않는다. 한 동작에 로그 둘이
 * 남으면 검색 건수 집계가 거짓이 된다.
 *
 * 검색 조건·고객명·연락처를 담지 않는다. 건수와 시각과 누가만 남는다. (ADR-0015, ADR-0022)
 */
export async function logQuoteExport(
  matched: number,
  actor: string,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: "QUOTE_EXPORTED",
      actor,
      summary: `견적 목록 CSV 내보내기 (${matched}건)`,
      targetType: "QuoteExport",
      targetId: "-",
    },
  });
}

/** 개인정보 열람 기록. 상세를 열 때마다 남긴다. (`.claude/rules/admin.md`) */
export async function logQuoteView(
  publicId: string,
  actor: string,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: "QUOTE_VIEWED",
      actor,
      summary: `견적 ${publicId} 상세 열람 (고객 연락처 포함)`,
      targetType: "Quote",
      targetId: publicId,
    },
  });
}

/**
 * 결제 방식 선택과 감사 기록을 같은 트랜잭션에서 수행한다. (`.claude/rules/admin.md`)
 * REQUESTED 상태에만 결제 방식을 선택할 수 있다.
 */
export async function updateQuotePaymentMethod(
  publicId: string,
  paymentMethod: PaymentMethod,
  actor: string,
  summary: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.quote.findUnique({
      where: { publicId },
      select: { paymentMethod: true },
    });

    const changed = await tx.quote.updateMany({
      where: { publicId, status: "REQUESTED" },
      data: { paymentMethod },
    });

    if (changed.count === 0) return false;

    await tx.auditLog.create({
      data: {
        action: "PAYMENT_METHOD_SELECTED",
        actor,
        summary,
        targetType: "Quote",
        targetId: publicId,
        beforeValue: { paymentMethod: before?.paymentMethod ?? null },
        afterValue: { paymentMethod },
      },
    });

    return true;
  });
}
