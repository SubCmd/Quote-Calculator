import { getCatalog } from "@/services/catalog/catalog";
import { QuoteForm } from "./quote-form";

export const dynamic = "force-dynamic";

export default async function QuotePage() {
  const catalog = await getCatalog(new Date());

  if (catalog.length === 0) {
    return (
      <main>
        <h1>견적 계산기</h1>
        <p className="subtitle">
          등록된 상품이 없습니다. <code>npm run db:seed</code> 로 샘플 데이터를
          넣어주세요.
        </p>
      </main>
    );
  }

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <p className="brand">입시 컨설팅</p>
          <h1>견적 계산기</h1>
          <p className="subtitle">
            원하는 항목을 고르면 금액이 바로 계산됩니다. 표시 금액은 모두 부가세
            포함입니다.
          </p>
        </div>
      </header>
      <main>
        <QuoteForm catalog={catalog} />
      </main>
    </>
  );
}
