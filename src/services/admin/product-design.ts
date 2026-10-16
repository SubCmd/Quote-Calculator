import {
  createOptionGroup as createOptionGroupRow,
  createProduct as createProductRow,
  findProductDesignView,
  setProductActive as setProductActiveRow,
  type CreateGroupInput,
  type CreateProductInput,
  type ProductDesignRow,
} from "@/repositories/product-design";

/**
 * 상품 설계(상위 탭·단계 신설, 상품 활성화). (ADR-0046)
 *
 * 금액 운영(`pricing-admin.ts`)과 나눠 둔다. 여기에는 `effectiveFrom` 도 미리보기도 없다.
 * 상품과 단계는 금액을 만들지 않는다.
 */

export type { ProductDesignRow };

export async function getProductDesign(): Promise<ProductDesignRow[]> {
  return findProductDesignView();
}

export async function createProduct(
  input: CreateProductInput,
  actor: string,
): Promise<void> {
  await createProductRow(input, actor);
}

export async function createGroup(
  input: CreateGroupInput,
  actor: string,
): Promise<void> {
  await createOptionGroupRow(input, actor);
}

export async function setProductActive(
  input: { productId: string; active: boolean },
  actor: string,
): Promise<void> {
  await setProductActiveRow(input.productId, input.active, actor);
}
