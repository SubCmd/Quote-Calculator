import { PaymentMethod } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { PAYMENT_METHOD_CHOICES, paymentMethodLabel } from "./payment-method";

describe("결제 방식 목록", () => {
  it("모든 PaymentMethod 값에 라벨이 있다", () => {
    const covered = PAYMENT_METHOD_CHOICES.map((c) => c.value).sort();
    const declared = Object.values(PaymentMethod).sort();

    expect(covered).toEqual(declared);
  });

  it("같은 값을 두 번 담지 않는다", () => {
    const values = PAYMENT_METHOD_CHOICES.map((c) => c.value);

    expect(new Set(values).size).toBe(values.length);
  });

  it("라벨과 설명이 빈 문자열이 아니다", () => {
    for (const choice of PAYMENT_METHOD_CHOICES) {
      expect(choice.label.trim()).not.toBe("");
      expect(choice.description.trim()).not.toBe("");
    }
  });

  it("각 값의 라벨을 돌려준다", () => {
    expect(paymentMethodLabel("BANK_TRANSFER")).toBe("입금");
    expect(paymentMethodLabel("CARD")).toBe("카드 결제 신청");
    expect(paymentMethodLabel("CONSULTATION")).toBe("상담하기");
  });

  it("목록에 없는 값이면 예외를 던진다", () => {
    expect(() => paymentMethodLabel("NOPE" as PaymentMethod)).toThrow();
  });
});
