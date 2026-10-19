import type { QuoteStatus } from "@prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdmin, isAdminConfigured } from "@/lib/auth";
import { formatKRW } from "@/lib/money";
import {
  PAYMENT_METHOD_CHOICES,
  paymentMethodLabel,
} from "@/lib/payment-method";
import { listProductChoices, listQuotes } from "@/services/quote/admin-quotes";
import {
  type QuoteListQuery,
  parseQuotePage,
  parseQuoteSearch,
} from "@/services/quote/list-query";
import { statusLabel } from "@/services/quote/transition";
import { BulkQuoteList, type BulkListRow } from "./bulk-list";

export const dynamic = "force-dynamic";

const ACTOR = "admin";

const FILTERS: { value: QuoteStatus | null; label: string }[] = [
  { value: null, label: "전체" },
  { value: "REQUESTED", label: "요청 접수" },
  { value: "CONFIRMED", label: "확정" },
  { value: "CANCELED", label: "취소" },
];

export default async function AdminQuotesPage({
  searchParams,
}: {
  searchParams: Promise<QuoteListQuery>;
}) {
  if (!isAdminConfigured()) notFound();

  const now = new Date();
  if (!(await isAdmin(now))) redirect("/admin/login");

  const query = await searchParams;
  // 조건 해석은 내보내기와 같은 함수다. 두 번 적지 않는다. (ADR-0050)
  const search = parseQuoteSearch(query);
  const { status, hidden, productCode, customerPhone, paymentMethod } = search;

  // 이름·번호로 검색하면 열람 기록이 남는다.
  const [{ items, total, page, pageCount }, productChoices] = await Promise.all(
    [
      listQuotes(parseQuotePage(query.page), search, ACTOR, now),
      listProductChoices(),
    ],
  );

  const queryWith = (overrides: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string | null> = {
      status,
      name: search.customerName,
      from: query.from ?? null,
      to: query.to ?? null,
      hidden: hidden ? "1" : null,
      product: productCode,
      phone: customerPhone,
      // 해석된 값으로 다시 만든다. 주소창의 모르는 글자를 링크로 옮기지 않는다.
      payment: paymentMethod === "NONE" ? "none" : paymentMethod,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged))
      if (value) params.set(key, value);
    return params.toString();
  };

  const hrefWith = (overrides: Record<string, string | null>) => {
    const params = queryWith(overrides);
    return params ? `/admin/quotes?${params}` : "/admin/quotes";
  };

  // 지금 보고 있는 조건 그대로 내려받는다. 페이지는 담지 않는다. (ADR-0050)
  const exportParams = queryWith({ page: null });
  const exportHref = exportParams
    ? `/api/admin/quotes/export?${exportParams}`
    : "/api/admin/quotes/export";

  // 금액·일시 포맷은 서버에서 끝낸다. 클라이언트가 다시 만들면 수화가 어긋난다.
  const rows: BulkListRow[] = items.map((item) => ({
    publicId: item.publicId,
    whenText: item.calculatedAt.toLocaleString("ko-KR"),
    productName: item.productName,
    customerName: item.customerName,
    customerPhone: item.customerPhone,
    totalText: formatKRW(item.totalAmount),
    // 총계를 더하는 데 필요한 정수. 더하는 식은 `src/lib/quote-sum.ts` 에만 있다. (ADR-0049)
    totalAmount: item.totalAmount,
    paymentText: item.paymentMethod
      ? paymentMethodLabel(item.paymentMethod)
      : "—",
    statusText: statusLabel(item.status),
    dimmed: item.status === "EXPIRED" || item.status === "CANCELED",
    deletable: item.deletable,
  }));

  const filterHref = (value: QuoteStatus | null) =>
    hrefWith({ status: value, page: null });
  const pageHref = (target: number) =>
    hrefWith({ page: target > 1 ? String(target) : null });

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner admin-bar">
          <div>
            <p className="brand">관리자</p>
            <h1>견적 목록</h1>
            <p className="subtitle">
              줄을 골라 총계를 볼 수 있습니다. 상세를 열면 열람 기록이 남습니다.
            </p>
          </div>
          <div className="admin-nav">
            <Link className="ghost" href="/admin">
              가격 규칙
            </Link>
            <form action="/api/admin/logout" method="post">
              <button type="submit" className="ghost">
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </header>
      <main>
        <form className="card search-form" method="get" action="/admin/quotes">
          {status && <input type="hidden" name="status" value={status} />}
          {hidden && <input type="hidden" name="hidden" value="1" />}
          <div className="search-field">
            <label htmlFor="name">고객명</label>
            <input
              id="name"
              name="name"
              type="search"
              defaultValue={query.name ?? ""}
              placeholder="이름 일부"
            />
          </div>
          <div className="search-field">
            <label htmlFor="phone">연락처</label>
            <input
              id="phone"
              name="phone"
              type="search"
              inputMode="numeric"
              defaultValue={query.phone ?? ""}
              placeholder="숫자 일부"
            />
          </div>
          <div className="search-field">
            <label htmlFor="product">상품</label>
            <select id="product" name="product" defaultValue={productCode ?? ""}>
              <option value="">전체</option>
              {productChoices.map((choice) => (
                <option key={choice.code} value={choice.code}>
                  {choice.isActive ? choice.name : `${choice.name} (꺼짐)`}
                </option>
              ))}
            </select>
          </div>
          <div className="search-field">
            <label htmlFor="payment">결제 방식</label>
            <select
              id="payment"
              name="payment"
              defaultValue={paymentMethod === "NONE" ? "none" : paymentMethod ?? ""}
            >
              <option value="">전체</option>
              {PAYMENT_METHOD_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
              <option value="none">미선택</option>
            </select>
          </div>
          <div className="search-field">
            <label htmlFor="from">시작일</label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={query.from ?? ""}
            />
          </div>
          <div className="search-field">
            <label htmlFor="to">종료일</label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={query.to ?? ""}
            />
          </div>
          <div className="search-actions">
            <button type="submit" className="primary">
              검색
            </button>
            <Link className="ghost" href="/admin/quotes">
              초기화
            </Link>
          </div>
          <p className="hint">
            기간은 요청 일시 기준이고 종료일 당일을 포함합니다. 연락처는 하이픈
            없이 일부만 넣어도 찾습니다. 고객명·연락처로 검색하면 찾아봤다는
            사실이 변경 이력에 남습니다. 검색어는 남지 않습니다. (ADR-0015)
          </p>
        </form>

        <nav className="filters" aria-label="상태 필터">
          {FILTERS.map((filter) => (
            <Link
              key={filter.label}
              href={filterHref(filter.value)}
              className={filter.value === status ? "chip selected" : "chip"}
              aria-current={filter.value === status ? "page" : undefined}
            >
              {filter.label}
            </Link>
          ))}
          <span className="muted">{total}건</span>
          <Link
            href={hrefWith({ hidden: hidden ? null : "1", page: null })}
            className={hidden ? "chip selected" : "chip"}
            aria-current={hidden ? "page" : undefined}
          >
            {hidden ? "← 보이는 견적" : "숨긴 견적"}
          </Link>
        </nav>

        {hidden && (
          <p className="hint">
            숨긴 견적입니다. 데이터는 지워지지 않았고 고객 링크만 닫혀 있습니다.
            상세를 열어 되돌릴 수 있습니다. (ADR-0035)
          </p>
        )}

        {rows.length > 0 && (
          <div className="list-actions">
            <a className="ghost" href={exportHref} download>
              CSV 내보내기
            </a>
            <p className="hint">
              지금 좁힌 조건의 목록을 내려받습니다. 보고 있는 페이지가 아니라
              조건 전체이고, 금액은 엑셀이 더할 수 있는 숫자입니다. 내려받은
              사실이 변경 이력에 남습니다. (ADR-0050)
            </p>
          </div>
        )}

        <div className="card">
          {rows.length === 0 ? (
            <p className="empty-note">해당하는 견적이 없습니다.</p>
          ) : (
            <BulkQuoteList rows={rows} hiddenView={hidden} />
          )}
        </div>

        {pageCount > 1 && (
          <nav className="pager" aria-label="페이지">
            {page > 1 && (
              <Link className="ghost" href={pageHref(page - 1)}>
                이전
              </Link>
            )}
            <span className="muted">
              {page} / {pageCount}
            </span>
            {page < pageCount && (
              <Link className="ghost" href={pageHref(page + 1)}>
                다음
              </Link>
            )}
          </nav>
        )}
      </main>
    </>
  );
}
