import type { QuoteStatus } from "@prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdmin, isAdminConfigured } from "@/lib/auth";
import { formatKRW } from "@/lib/money";
import { listQuotes } from "@/services/quote/admin-quotes";
import { statusLabel } from "@/services/quote/transition";

export const dynamic = "force-dynamic";

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

function filterHref(status: QuoteStatus | null): string {
  return status === null ? "/admin/quotes" : `/admin/quotes?status=${status}`;
}

export default async function AdminQuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  if (!isAdminConfigured()) notFound();

  const now = new Date();
  if (!(await isAdmin(now))) redirect("/admin/login");

  const query = await searchParams;
  const status = parseStatus(query.status);
  const { items, total, page, pageCount } = await listQuotes(
    parsePage(query.page),
    status,
    now,
  );

  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (target > 1) params.set("page", String(target));
    const search = params.toString();
    return search ? `/admin/quotes?${search}` : "/admin/quotes";
  };

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
        </nav>

        <div className="card">
          {items.length === 0 ? (
            <p className="empty-note">해당하는 견적이 없습니다.</p>
          ) : (
            <table className="quote-list">
              <thead>
                <tr>
                  <th>요청 일시</th>
                  <th>상품</th>
                  <th>고객</th>
                  <th>연락처</th>
                  <th>총액</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.publicId}>
                    <td className="when">
                      <Link href={`/admin/quotes/${item.publicId}`}>
                        {item.calculatedAt.toLocaleString("ko-KR")}
                      </Link>
                    </td>
                    <td>{item.productName}</td>
                    <td>{item.maskedName}</td>
                    <td className="num">{item.maskedPhone}</td>
                    <td className="num">{formatKRW(item.totalAmount)}</td>
                    <td>
                      <span
                        className={
                          item.status === "EXPIRED" ||
                          item.status === "CANCELED"
                            ? "status-badge expired"
                            : "status-badge"
                        }
                      >
                        {statusLabel(item.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
