import type { PaymentMethod } from "@prisma/client";

export interface PaymentMethodChoice {
  value: PaymentMethod;
  label: string;
  description: string;
  /**
   * 이 방식으로 결제하면 현금가에 부가세 10%가 더해지는가. (ADR-0039)
   * 어느 방식이 그런지를 여기 한 곳에만 적는다. 화면이 `=== "CARD"` 로 분기하면
   * 방식이 늘 때 그 조건문을 찾아다녀야 한다.
   */
  vatAdded: boolean;
}

/**
 * 결제 방식 목록. 고객 화면과 관리자 화면이 같은 배열을 쓴다.
 * 양쪽에 따로 적으면 문구가 갈라지고, 고객이 고른 것과 담당자가 읽는 것이 달라진다.
 *
 * 카드 결제는 아직 PG 연동이 없다. 담당자가 결제 링크를 보내는 운영 흐름이라
 * 라벨도 `카드 결제` 가 아니라 `카드 결제 신청` 이고 설명도 그렇게 적는다.
 * 되는 것처럼 적지 않는다. (ADR-0033)
 *
 * Service 가 아니라 `src/lib/` 에 있다. 클라이언트 컴포넌트가 이 배열을 쓰는데,
 * Service 는 Repository 를 거쳐 `node:crypto` 까지 끌고 와서 번들에 들어가지 않는다.
 */
export const PAYMENT_METHOD_CHOICES: PaymentMethodChoice[] = [
  {
    value: "BANK_TRANSFER",
    label: "입금",
    description: "계좌로 입금 후 담당자 연락",
    vatAdded: false,
  },
  {
    value: "CARD",
    label: "카드 결제 신청",
    description: "담당자가 결제 링크를 보내드립니다",
    vatAdded: true,
  },
  {
    value: "CONSULTATION",
    label: "상담하기",
    description: "담당자와 상담 후 결정",
    vatAdded: false,
  },
];

export function paymentMethodLabel(method: PaymentMethod): string {
  const found = PAYMENT_METHOD_CHOICES.find((c) => c.value === method);
  if (!found) throw new Error(`알 수 없는 결제 방식: ${method}`);
  return found.label;
}
