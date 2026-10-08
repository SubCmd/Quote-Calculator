import { z } from "zod";

/**
 * 견적 저장 입력. 받는 개인정보는 연락 수단뿐이다. (ADR-0013)
 * 클라이언트 검증은 UX 보조일 뿐이고 여기가 기준이다. (ADR-0003)
 */
export const saveQuoteSchema = z.object({
  productId: z.string().min(1),
  optionIds: z.array(z.string().min(1)).default([]),
  // 동의 없이 개인정보를 저장하지 않는다. true 가 아닌 모든 값이 거부다. (ADR-0018)
  privacyConsent: z.literal(true, {
    errorMap: () => ({ message: "개인정보 수집·이용에 동의해 주세요." }),
  }),
  customer: z.object({
    name: z.string().trim().min(1, "이름을 입력해 주세요.").max(50),
    phone: z
      .string()
      .trim()
      // 하이픈이 있든 없든 받고, 저장 전에 숫자만 남긴다.
      .regex(/^01[0-9]-?\d{3,4}-?\d{4}$/, "휴대폰 번호 형식이 올바르지 않습니다.")
      .transform((value) => value.replace(/-/g, "")),
    email: z
      .string()
      .trim()
      .max(100)
      .email("이메일 형식이 올바르지 않습니다.")
      .optional()
      .or(z.literal(""))
      .transform((value) => (value ? value : null)),
  }),
});

export type SaveQuoteRequest = z.infer<typeof saveQuoteSchema>;
