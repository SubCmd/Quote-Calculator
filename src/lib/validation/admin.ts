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

/**
 * 설명 문구. 빈 값은 `null` 로 모은다. 지우는 것이 정상 동작이다. (ADR-0025)
 * 평문으로만 다룬다. HTML 로 해석하지 않으므로 태그를 거를 필요가 없다.
 */
const descriptionText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: `설명이 너무 깁니다. ${max}자까지 쓸 수 있습니다.` })
    .optional()
    .transform((value) => (value ? value : null));

const descriptionFields = {
  productId: z.string().min(1),
  groupCode: z.string().min(1),
  /** 이름 아래 항상 보이는 한 줄. 길면 한 줄이 아니게 된다 */
  summary: descriptionText(120),
  detail: descriptionText(2_000),
};

export const groupDescriptionSchema = z.object(descriptionFields);

export const optionDescriptionSchema = z.object({
  ...descriptionFields,
  optionCode: z.string().min(1),
});

/** 비활성화는 금액을 받지 않는다. 대상만 받는다. (ADR-0017) */
export const deactivateOptionSchema = z.object({
  productId: z.string().min(1),
  groupCode: z.string().min(1),
  optionCode: z.string().min(1),
});

/** 재활성화도 대상만 받는다. 되살릴 금액은 끄기 전에 쓰던 값 그대로다. (ADR-0023) */
export const reactivateOptionSchema = deactivateOptionSchema;

/**
 * 할인 비활성화. 조건 옵션은 건드리지 않으므로 대상 할인만 받는다. (ADR-0026)
 * 옵션 비활성화와 입력 모양이 같아도 의미가 달라서 따로 둔다.
 */
export const deactivateDiscountSchema = z.object({
  productId: z.string().min(1),
  discountCode: z.string().min(1),
});

/**
 * 표시 순서는 그 묶음의 **전체 순열**로 받는다. (ADR-0026)
 * 여기서는 모양만 본다. 구성원이 빠짐없이 한 번씩 들어 있는지는 서버가 현재 순서를
 * 읽어서 `planReorder` 로 판정한다. 클라이언트가 보낸 목록만으로는 알 수 없다.
 */
const orderedCodes = z
  .array(z.string().trim().min(1).max(40))
  .min(1, { message: "순서 목록이 비어 있습니다." })
  .max(200);

export const reorderProductsSchema = z.object({ productCodes: orderedCodes });

export const reorderGroupsSchema = z.object({
  productId: z.string().min(1),
  groupCodes: orderedCodes,
});

export const reorderOptionsSchema = z.object({
  productId: z.string().min(1),
  groupCode: z.string().min(1),
  optionCodes: orderedCodes,
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

/** 결제 방식 선택 */
export const paymentMethodSchema = z.object({
  paymentMethod: z.enum(["BANK_TRANSFER", "CARD", "CONSULTATION"]),
});
