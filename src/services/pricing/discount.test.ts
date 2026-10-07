import { describe, expect, it } from "vitest";
import { resolveDiscount } from "./discount";
import type { DiscountRule } from "./types";

/** 조건 옵션 2개를 모두 선택해야 걸리는 묶음 할인 (ADR-0009) */
const bundleDiscount: DiscountRule = {
  id: "disc-bundle",
  name: "통합 할인 15%",
  type: "RATE",
  amount: 0,
  rateBp: 1500,
  requiredOptionIds: ["opt-a", "opt-b"],
  priority: 10,
  versionId: "v-disc-bundle",
};

/** 조건이 없는 할인. 항상 후보다. */
const couponDiscount: DiscountRule = {
  id: "disc-coupon",
  name: "쿠폰 50,000원 할인",
  type: "FIXED",
  amount: 50_000,
  rateBp: 0,
  requiredOptionIds: [],
  priority: 20,
  versionId: "v-disc-coupon",
};

describe("resolveDiscount - 적용 조건", () => {
  it("조건 옵션을 전부 선택하면 할인 후보가 된다", () => {
    const result = resolveDiscount([bundleDiscount], 500_000, [
      "opt-a",
      "opt-b",
    ]);
    expect(result.candidates).toHaveLength(1);
    expect(result.discountAmount).toBe(75_000);
  });

  it("조건 옵션 중 하나라도 빠지면 후보에서 제외된다", () => {
    const result = resolveDiscount([bundleDiscount], 500_000, ["opt-a"]);
    expect(result.candidates).toHaveLength(0);
    expect(result.appliedDiscount).toBeNull();
    expect(result.discountAmount).toBe(0);
  });

  it("조건 옵션 외에 다른 옵션을 더 선택해도 할인이 유지된다", () => {
    const result = resolveDiscount([bundleDiscount], 500_000, [
      "opt-a",
      "opt-c",
      "opt-b",
    ]);
    expect(result.appliedDiscount?.discountId).toBe("disc-bundle");
  });

  it("조건 목록이 비어 있으면 아무것도 선택하지 않아도 후보다", () => {
    const result = resolveDiscount([couponDiscount], 500_000, []);
    expect(result.candidates).toHaveLength(1);
    expect(result.discountAmount).toBe(50_000);
  });
});

describe("resolveDiscount - 후보 비교 (ADR-0006)", () => {
  it("후보가 여러 개면 할인액이 큰 쪽을 적용한다", () => {
    const result = resolveDiscount([bundleDiscount, couponDiscount], 500_000, [
      "opt-a",
      "opt-b",
    ]);
    expect(result.appliedDiscount?.discountId).toBe("disc-bundle");
    expect(result.discountAmount).toBe(75_000);
    expect(result.candidates).toHaveLength(2);
  });

  it("소계가 작으면 정액 할인이 정률 할인보다 커서 선택된다", () => {
    const result = resolveDiscount([bundleDiscount, couponDiscount], 200_000, [
      "opt-a",
      "opt-b",
    ]);
    expect(result.appliedDiscount?.discountId).toBe("disc-coupon");
    expect(result.discountAmount).toBe(50_000);
  });

  it("할인액이 동률이면 priority 가 낮은 규칙을 적용한다", () => {
    const tie: DiscountRule = {
      ...couponDiscount,
      id: "disc-tie",
      priority: 5,
    };
    const other: DiscountRule = {
      ...couponDiscount,
      id: "disc-other",
      priority: 30,
    };
    const result = resolveDiscount([other, tie], 500_000, []);
    expect(result.appliedDiscount?.discountId).toBe("disc-tie");
  });
});

describe("resolveDiscount - 버림과 상한 (ADR-0007)", () => {
  it("할인액을 10원 단위로 버린다", () => {
    const result = resolveDiscount([bundleDiscount], 33_770, [
      "opt-a",
      "opt-b",
    ]);
    expect(result.candidates[0]?.amount).toBe(5065);
    expect(result.discountAmount).toBe(5060);
  });

  it("할인액이 소계보다 크면 소계까지만 차감한다", () => {
    const result = resolveDiscount([couponDiscount], 1200, []);
    expect(result.discountAmount).toBe(1200);
  });

  it("버림 때문에 할인액이 0원이 되는 저액 거래가 있다", () => {
    const result = resolveDiscount([bundleDiscount], 60, ["opt-a", "opt-b"]);
    expect(result.candidates[0]?.amount).toBe(9);
    expect(result.discountAmount).toBe(0);
  });
});
