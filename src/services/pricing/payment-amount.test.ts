import { describe, expect, it } from "vitest";
import { cardPaymentAmount } from "./payment-amount";

describe("cardPaymentAmount", () => {
  const cases: Array<{ name: string; cash: number; card: number }> = [
    { name: "버림이 일어나지 않는 금액", cash: 267_000, card: 293_700 },
    { name: "10원 단위가 깨지는 금액은 버린다", cash: 210, card: 230 },
    {
      name: "1원 자리까지 깨지는 금액도 10원 단위로 버린다",
      cash: 59_990,
      card: 65_980,
    },
    { name: "0원은 0원이다", cash: 0, card: 0 },
    { name: "통합등록 금액", cash: 1_490_000, card: 1_639_000 },
  ];

  for (const { name, cash, card } of cases) {
    it(`${name}: ${cash} → ${card}`, () => {
      expect(cardPaymentAmount(cash)).toBe(card);
    });
  }

  it("카드 금액은 항상 10원 단위다", () => {
    for (const cash of [0, 10, 210, 59_990, 267_000, 1_490_000]) {
      expect(cardPaymentAmount(cash) % 10).toBe(0);
    }
  });

  it("카드 금액은 현금가보다 작지 않다", () => {
    for (const cash of [0, 10, 210, 59_990, 267_000]) {
      expect(cardPaymentAmount(cash)).toBeGreaterThanOrEqual(cash);
    }
  });
});
