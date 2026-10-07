import { z } from "zod";

/** 비워 두면 즉시 적용. (.claude/rules/admin.md) */
const effectiveFrom = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? new Date(value) : null))
  .refine((value) => value === null || !Number.isNaN(value.getTime()), {
    message: "적용 시작 일시가 올바르지 않습니다.",
  });

const amount = z.number().int().min(0).max(100_000_000);

export const optionVersionSchema = z.object({
  productId: z.string().min(1),
  groupCode: z.string().min(1),
  optionCode: z.string().min(1),
  optionVersionId: z.string().min(1),
  amount,
  effectiveFrom,
});

export const discountVersionSchema = z.object({
  productId: z.string().min(1),
  discountCode: z.string().min(1),
  discountVersionId: z.string().min(1),
  amount,
  /** 만분율 정수. 100% 를 넘기지 않는다 */
  rateBp: z.number().int().min(0).max(10_000),
  priority: z.number().int().min(0).max(10_000),
  effectiveFrom,
});

export const previewSchema = z.object({
  productId: z.string().min(1),
  optionIds: z.array(z.string().min(1)).max(50),
  change: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("option"),
      optionVersionId: z.string().min(1),
      amount,
    }),
    z.object({
      kind: z.literal("discount"),
      discountVersionId: z.string().min(1),
      amount,
      rateBp: z.number().int().min(0).max(10_000),
      priority: z.number().int().min(0).max(10_000),
    }),
  ]),
});

export const loginSchema = z.object({ password: z.string().min(1).max(200) });

/**
 * 견적 상태 변경. 임의 상태 지정 API 를 만들지 않는다. (`.claude/rules/admin.md`)
 * `EXPIRED` 는 저장 상태가 아니므로 받지 않는다. (ADR-0012)
 */
export const quoteStatusSchema = z.object({
  status: z.enum(["REQUESTED", "CONFIRMED", "CANCELED"]),
});
