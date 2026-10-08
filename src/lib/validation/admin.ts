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

const optionName = z
  .string()
  .trim()
  .min(1, { message: "옵션 이름을 입력하세요." })
  .max(100, { message: "옵션 이름이 너무 깁니다." });

/**
 * 새로 만드는 옵션의 코드. 할인 조건이 이 값으로 옵션을 가리킨다. (ADR-0009)
 * 기존 데이터와 같은 모양(대문자·숫자·밑줄)으로 제한한다. 한 번 정하면 바꿀 수 없다. (ADR-0023)
 */
const newOptionCode = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Z][A-Z0-9_]*$/, {
    message: "옵션 코드는 대문자로 시작하고 대문자·숫자·밑줄만 쓸 수 있습니다.",
  });

/** 이름과 금액을 함께 담은 새 버전. `code` 는 받지 않는다. 불변이다. (ADR-0023) */
export const optionVersionSchema = z.object({
  productId: z.string().min(1),
  groupCode: z.string().min(1),
  optionCode: z.string().min(1),
  optionVersionId: z.string().min(1),
  name: optionName,
  amount,
  effectiveFrom,
});

/** 신규 옵션. 그룹은 기존 것 중에서 고른다. 그룹을 만들지는 않는다. (ADR-0023) */
export const createOptionSchema = z.object({
  productId: z.string().min(1),
  groupCode: z.string().min(1),
  optionCode: newOptionCode,
  name: optionName,
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

/** 비활성화는 금액을 받지 않는다. 대상만 받는다. (ADR-0017) */
export const deactivateOptionSchema = z.object({
  productId: z.string().min(1),
  groupCode: z.string().min(1),
  optionCode: z.string().min(1),
});

/** 재활성화도 대상만 받는다. 되살릴 금액은 끄기 전에 쓰던 값 그대로다. (ADR-0023) */
export const reactivateOptionSchema = deactivateOptionSchema;

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
