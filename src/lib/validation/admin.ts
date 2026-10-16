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

/**
 * 새로 만드는 상품·단계의 코드. 옵션 코드와 같은 형식이고 불변이다. (ADR-0046 §3)
 * 한글로 받지 않는다. 스크립트·쿼리·로그에 같은 글자가 나와야 한다.
 */
const newStructureCode = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Z][A-Z0-9_]*$/, {
    message: "코드는 대문자로 시작하고 대문자·숫자·밑줄만 쓸 수 있습니다.",
  });

const structureName = z
  .string()
  .trim()
  .min(1, { message: "이름을 입력하세요." })
  .max(100, { message: "이름이 너무 깁니다." });

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

/**
 * 묶음 관계 등록. 적용 시작 시각이 없다. 관계는 금액이 아니다. (ADR-0038)
 * 구성이 2개 이상인지는 여기서도 보지만, 묶음 옵션이 구성에 들어갔는지와
 * 그 코드가 실제로 있는지는 상품을 읽어야 알므로 Repository 가 판정한다.
 */
export const addBundleSchema = z.object({
  productId: z.string().min(1),
  groupCode: z.string().min(1),
  optionCode: z.string().min(1),
  components: z
    .array(
      z.object({
        groupCode: z.string().min(1),
        optionCode: z.string().min(1),
      }),
    )
    .min(2, { message: "구성 옵션을 2개 이상 고르세요." })
    .max(20),
});

/** 묶음 관계 삭제. 수정이 없으므로 대상만 받는다. (ADR-0038) */
export const removeBundleSchema = z.object({
  productId: z.string().min(1),
  groupCode: z.string().min(1),
  optionCode: z.string().min(1),
});

/**
 * 상품(상위 탭) 신설. (ADR-0046 §2, §4)
 * `isActive` 도 `sortOrder` 도 받지 않는다. 비활성으로 태어나고 맨 뒤에 붙는다.
 */
export const createProductSchema = z.object({
  code: newStructureCode,
  name: structureName,
});

/**
 * 단계(그룹) 신설. (ADR-0046 §5)
 * 선행 그룹이 같은 상품인지와 선행 옵션 코드가 실제로 있는지는 상품을 읽어야 알므로
 * Repository 가 판정한다. 여기서는 모양과 **함께 켤 수 없는 조합**만 본다.
 */
export const createGroupSchema = z
  .object({
    productId: z.string().min(1),
    code: newStructureCode,
    name: structureName,
    required: z.boolean(),
    singleSelect: z.boolean(),
    selectAll: z.boolean(),
    dependsOnGroupId: z.string().trim().min(1).nullable(),
    dependsOnOptionCode: z.string().trim().min(1).max(40).nullable(),
  })
  // 선행 그룹 없이 선행 옵션 코드만 있는 행은 뜻이 없다. (ADR-0044)
  .refine(
    (value) =>
      value.dependsOnOptionCode === null || value.dependsOnGroupId !== null,
    {
      message: "선행 옵션을 지정하려면 선행 단계도 골라야 합니다.",
      path: ["dependsOnGroupId"],
    },
  )
  // 하나만 고르는 그룹에 전체 선택 버튼은 뜻이 성립하지 않는다. (ADR-0043 §2)
  .refine((value) => !(value.selectAll && value.singleSelect), {
    message: "단일 선택 단계에는 전체 선택 버튼을 둘 수 없습니다.",
    path: ["selectAll"],
  });

/** 상품 활성화·비활성화. 판정은 `canSetProductActive` 가 한다. (ADR-0046 §2) */
export const setProductActiveSchema = z.object({
  productId: z.string().min(1),
  active: z.boolean(),
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

/**
 * 견적 숨기기·되돌리기. 숨김은 상태가 아니라 표시 여부라서 따로 받는다. (ADR-0035)
 * 되돌리는 요청과 같은 모양이어야 하므로 `hidden` 한 칸이다.
 */
export const quoteHiddenSchema = z.object({ hidden: z.boolean() });

/**
 * 목록에서 고른 건을 한꺼번에 숨기거나 지운다. (ADR-0041)
 *
 * `action` 을 본문에 받는다. 지우는 경로와 숨기는 경로를 가르지 않는 이유는, 두 버튼이
 * 같은 선택을 보내고 결과 처리도 같아서다. 상한은 한 페이지 크기(`PAGE_SIZE`)에 맞춘다.
 * 체크박스로 고르는 것이므로 한 번에 그보다 많이 보낼 길이 없다.
 * 같은 `publicId` 를 두 번 보내면 건수가 어긋나므로 중복을 거부한다.
 */
export const quoteBulkActionSchema = z.object({
  action: z.enum(["hide", "delete"]),
  publicIds: z
    .array(z.string().min(1).max(64))
    .min(1)
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "같은 견적이 두 번 들어 있습니다.",
    }),
});
