import { z } from "zod";

/**
 * 플랜 조회 입력. (ADR-0045)
 *
 * 이름과 휴대전화번호를 **둘 다** 받는다. 하나만으로는 조회하지 않는다.
 * 저장 형식과 같은 모양으로 맞춘다. 이름은 `trim`, 전화번호는 숫자만이다.
 * 여기서 맞추지 않으면 하이픈을 넣은 고객이 자기 플랜을 못 찾는다.
 *
 * **빈 값을 서버가 먼저 막는다.** 파기된 플랜(ADR-0022)의 연락처는 `null` 이라
 * 빈 문자열이 흘러 들어가는 길을 만들지 않는다.
 */
export const quoteLookupSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력해 주세요.").max(50),
  phone: z
    .string()
    .trim()
    .regex(/^01[0-9]-?\d{3,4}-?\d{4}$/, "휴대폰 번호 형식이 올바르지 않습니다.")
    .transform((value) => value.replace(/-/g, "")),
});

export type QuoteLookupRequest = z.infer<typeof quoteLookupSchema>;
