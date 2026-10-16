/**
 * 상품을 켤 수 있는지 판정한다. (ADR-0046 §2)
 *
 * 화면의 버튼 비활성과 서버의 거부가 같은 함수를 쓴다. 조건문을 두 번 적으면
 * 버튼은 열려 있는데 저장이 막히거나, 더 나쁘게는 버튼이 막혀 있는데 저장이 통과한다.
 */

/** 판정에 필요한 것만. 상품 전체를 넘기지 않는다. */
export interface ProductActivationInput {
  isActive: boolean;
  /** 그 상품의 활성 옵션 개수. 그룹 수는 보지 않는다. 그룹은 금액을 가지지 않는다. */
  activeOptionCount: number;
}

export type ActivationCheck =
  { allowed: true } | { allowed: false; reason: string };

export function canActivateProduct(
  product: ProductActivationInput,
): ActivationCheck {
  if (product.isActive) {
    return { allowed: false, reason: "이미 활성 상태입니다." };
  }

  // 빈 탭은 눌러도 고를 것이 없고 0원으로 계산된다. 켜지지 않게 막는다. (ADR-0046 §2)
  if (product.activeOptionCount === 0) {
    return {
      allowed: false,
      reason:
        "활성 옵션이 하나도 없습니다. 단계를 만들고 옵션을 등록한 뒤에 켜주세요.",
    };
  }

  return { allowed: true };
}

export function canDeactivateProduct(
  product: ProductActivationInput,
): ActivationCheck {
  if (!product.isActive) {
    return { allowed: false, reason: "이미 비활성 상태입니다." };
  }

  return { allowed: true };
}

/** 부르는 쪽이 방향으로 분기하지 않도록 하나로 묶는다. */
export function canSetProductActive(
  product: ProductActivationInput,
  active: boolean,
): ActivationCheck {
  return active ? canActivateProduct(product) : canDeactivateProduct(product);
}
