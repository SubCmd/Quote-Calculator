import { z } from "zod";

/** 서버 입력 검증. 클라이언트 검증은 UX 보조일 뿐이다. (ADR-0003) */
export const estimateRequestSchema = z.object({
  productId: z.string().min(1),
  optionIds: z.array(z.string().min(1)).default([]),
});

export type EstimateRequest = z.infer<typeof estimateRequestSchema>;
