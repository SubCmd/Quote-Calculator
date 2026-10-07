import { randomBytes } from "node:crypto";
import type { Prisma, QuoteStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AppliedOption } from "@/services/pricing/types";
import type {
  CustomerInput,
  QuoteSnapshot,
  SavedQuoteItem,
} from "@/services/quote/types";

export interface CreateQuoteInput {
  customer: CustomerInput;
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
}

/**
 * 조회 URL 에 그대로 실리고 인증이 없다. 추측 가능하면 남의 견적이 열린다.
 * 순번이나 cuid 처럼 규칙이 보이는 값을 쓰지 않는다. (ADR-0013)
 */
function newPublicId(): string {
  return randomBytes(16).toString("base64url");
}

export async function createQuote(input: CreateQuoteInput): Promise<string> {
  const quote = await prisma.quote.create({
    data: {
      publicId: newPublicId(),
      status: "REQUESTED",
      customerName: input.customer.name,
      customerPhone: input.customer.phone,
      customerEmail: input.customer.email,
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
    },
    select: { publicId: true },
  });

  return quote.publicId;
}

/** 고객 조회용. 개인정보 컬럼은 꺼내지 않는다. (`.claude/rules/database.md`) */
export async function findQuoteByPublicId(
  publicId: string,
): Promise<QuoteRow | null> {
  const quote = await prisma.quote.findUnique({
    where: { publicId },
    select: {
      publicId: true,
      status: true,
      subtotal: true,
      discountAmount: true,
      totalAmount: true,
      snapshot: true,
      calculatedAt: true,
      expiresAt: true,
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
}

export interface QuoteListPage {
  rows: QuoteListRow[];
  total: number;
}

/**
 * 관리자 목록. 무제한 조회를 만들지 않는다. (`.claude/rules/database.md`)
 * 이름·번호를 꺼내 오지만 마스킹은 Service 의 일이다. 원본은 여기서 더 나가지 않는다.
 */
export async function findQuoteList(
  take: number,
  skip: number,
  status: QuoteStatus | null,
): Promise<QuoteListPage> {
  const where = status === null ? {} : { status };

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
      productNames: quote.items.map((item) => item.product.name),
    })),
    total,
  };
}

export interface QuoteDetailRow extends QuoteRow {
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  createdAt: Date;
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
    subtotal: quote.subtotal,
    discountAmount: quote.discountAmount,
    totalAmount: quote.totalAmount,
    snapshot: quote.snapshot as unknown as QuoteSnapshot,
    calculatedAt: quote.calculatedAt,
    expiresAt: quote.expiresAt,
    createdAt: quote.createdAt,
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
      data: { status: to },
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
