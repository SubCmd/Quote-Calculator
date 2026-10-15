import type { QuoteStatus } from "@prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdmin, isAdminConfigured } from "@/lib/auth";
import { formatKRW } from "@/lib/money";
import { paymentMethodLabel } from "@/lib/payment-method";
import { listQuotes } from "@/services/quote/admin-quotes";
import { parseSearchRange } from "@/services/quote/search-range";
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

/** 저장 상태만 필터로 받는다. `EXPIRED` 는 저장되지 않으므로 조건이 될 수 없다. (ADR-0012) */
function parseStatus(raw: string | undefined): QuoteStatus | null {
  const match = FILTERS.find((f) => f.value !== null && f.value === raw);
  return match?.value ?? null;
}

function parsePage(raw: string | undefined): number {
  const page = Number(raw ?? "1");
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/** 공백만 넣은 검색은 조건 없음이다. 전체 조회를 검색으로 기록하지 않는다. (ADR-0015) */
function parseName(raw: string | undefined): string | null {
  const name = raw?.trim();
  return name ? name : null;
}

export default async function AdminQuotesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    page?: string;
    name?: string;
    from?: string;
    to?: string;
    hidden?: string;
  }>;
}) {
  if (!isAdminConfigured()) notFound();

  const now = new Date();
  if (!(await isAdmin(now))) redirect("/admin/login");

  const query = await searchParams;
  const status = parseStatus(query.status);
  const customerName = parseName(query.name);
  const { from, until } = parseSearchRange(query.from, query.to);
  // 숨긴 견적은 따로 본다. 되돌릴 자리가 그 목록이다. (ADR-0035)
  const hidden = query.hidden === "1";

  // 이름으로 검색하면 열람 기록이 남는다.
  const { items, total, page, pageCount } = await listQuotes(
    parsePage(query.page),
    { status, customerName, from, until, hidden },
    ACTOR,
    now,
  );

  const hrefWith = (overrides: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string | null> = {
      status,
      name: query.name?.trim() ?? null,
      from: query.from ?? null,
      to: query.to ?? null,
      hidden: hidden ? "1" : null,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged))
      if (value) params.set(key, value);
    const search = params.toString();
    return search ? `/admin/quotes?${search}` : "/admin/quotes";
  };

  // 금액·일시 포맷은 서버에서 끝낸다. 클라이언트가 다시 만들면 수화가 어긋난다.
  const rows: BulkListRow[] = items.map((item) => ({
    publicId: item.publicId,
    whenText: item.calculatedAt.toLocaleString("ko-KR"),
    productName: item.productName,
    maskedName: item.maskedName,
    maskedPhone: item.maskedPhone,
    totalText: formatKRW(item.totalAmount),
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
              연락처는 가려서 보여줍니다. 전체를 보려면 상세를 열어야 하고, 열람
              기록이 남습니다.
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
            기간은 요청 일시 기준이고 종료일 당일을 포함합니다. 고객명으로
            검색하면 검색어가 변경 이력에 남습니다. (ADR-0015)
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
