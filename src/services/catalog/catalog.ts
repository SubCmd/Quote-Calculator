import {
  findCatalog,
  type CatalogGroup,
  type CatalogOption,
  type CatalogProduct,
} from "@/repositories/product";

export type { CatalogGroup, CatalogOption, CatalogProduct };

export async function getCatalog(now: Date): Promise<CatalogProduct[]> {
  return findCatalog(now);
}
