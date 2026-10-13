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
  };
}

/**
 * 관리자 목록. 무제한 조회를 만들지 않는다. (`.claude/rules/database.md`)
 * 이름·번호를 꺼내 오지만 마스킹은 Service 의 일이다. 원본은 여기서 더 나가지 않는다.
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

export interface QuoteDetailRow extends QuoteRow {
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  /** `null` 이면 동의 절차 도입(ADR-0018) 전에 만들어진 견적이다. */
  privacyConsentAt: Date | null;
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
