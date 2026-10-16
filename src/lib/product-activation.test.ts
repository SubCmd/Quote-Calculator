import { describe, expect, it } from "vitest";
import {
  canActivateProduct,
  canDeactivateProduct,
  canSetProductActive,
} from "./product-activation";

describe("canActivateProduct", () => {
  it("활성 옵션이 있으면 켤 수 있다", () => {
    expect(
      canActivateProduct({ isActive: false, activeOptionCount: 1 }),
    ).toEqual({ allowed: true });
  });

  it("활성 옵션이 하나도 없으면 켜지 못하고 사유를 돌려준다", () => {
    const result = canActivateProduct({
      isActive: false,
      activeOptionCount: 0,
    });

    expect(result.allowed).toBe(false);
    expect(result).toHaveProperty("reason");
  });

  it("이미 활성인 상품은 다시 켜지 않는다", () => {
    expect(
      canActivateProduct({ isActive: true, activeOptionCount: 5 }).allowed,
    ).toBe(false);
  });
});

describe("canDeactivateProduct", () => {
  it("활성 상품은 끌 수 있다", () => {
    expect(
      canDeactivateProduct({ isActive: true, activeOptionCount: 3 }),
    ).toEqual({ allowed: true });
  });

  it("옵션이 없어도 끄는 것은 막지 않는다", () => {
    expect(
      canDeactivateProduct({ isActive: true, activeOptionCount: 0 }).allowed,
    ).toBe(true);
  });

  it("이미 비활성인 상품은 다시 끄지 않는다", () => {
    expect(
      canDeactivateProduct({ isActive: false, activeOptionCount: 3 }).allowed,
    ).toBe(false);
  });
});

describe("canSetProductActive", () => {
  it("켜는 방향은 canActivateProduct 와 같다", () => {
    const product = { isActive: false, activeOptionCount: 0 };

    expect(canSetProductActive(product, true)).toEqual(
      canActivateProduct(product),
    );
  });

  it("끄는 방향은 canDeactivateProduct 와 같다", () => {
    const product = { isActive: true, activeOptionCount: 0 };

    expect(canSetProductActive(product, false)).toEqual(
      canDeactivateProduct(product),
    );
  });
});
