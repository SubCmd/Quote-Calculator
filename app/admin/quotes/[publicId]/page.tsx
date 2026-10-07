import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdmin, isAdminConfigured } from "@/lib/auth";
import { formatKRW } from "@/lib/money";
import { getQuoteDetail } from "@/services/quote/admin-quotes";
import { statusLabel } from "@/services/quote/transition";
import { StatusForm } from "./status-form";

export const dynamic = "force-dynamic";

const ACTOR = "admin";

export default async function AdminQuoteDetailPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  if (!isAdminConfigured()) notFound();

  const now = new Date();
  if (!(await isAdmin(now))) redirect("/admin/login");

  const { publicId } = await params;
  // 연락처를 전부 보여주는 화면이다. 조회하는 순간 열람 기록이 남는다.
  const quote = await getQuoteDetail(publicId, ACTOR, now);
  if (!quote) notFound();

  const expired = quote.displayStatus === "EXPIRED";

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner admin-bar">
          <div>
            <p className="brand">관리자</p>
            <h1>견적 상세</h1>
            <p className="subtitle">
              금액은 발행 당시 스냅샷입니다. 가격 규칙이 바뀌어도 다시 계산하지
              않습니다.
            </p>
          </div>
          <div className="admin-nav">
            <Link className="ghost" href="/admin/quotes">
              목록으로
            </Link>
          </div>
        </div>
      </header>
      <main>
        <div className="card">
          <div className="quote-meta">
            <span className={expired ? "status-badge expired" : "status-badge"}>
              {statusLabel(quote.displayStatus)}
            </span>
            <span className="quote-id">{quote.publicId}</span>
          </div>

          <h2>고객</h2>
          <dl className="detail-grid">
            <dt>이름</dt>
            <dd>{quote.customerName}</dd>
            <dt>휴대폰</dt>
            <dd>{quote.customerPhone}</dd>
            <dt>이메일</dt>
            <dd>{quote.customerEmail}</dd>
          </dl>
          <p className="hint">
            이 화면을 연 기록이 변경 이력에 남습니다. 보관 기간이 지난 견적의
            연락처는 파기 대상입니다. (ADR-0013)
          </p>
        </div>

        <div className="card">
          <h2>금액</h2>
          <table className="quote-table">
            <tbody>
              {quote.items.map((item) => (
                <tr key={item.productId} className="product-row">
                  <th colSpan={2} scope="colgroup">
                    {item.productName}
                  </th>
                </tr>
              ))}
              {quote.items.flatMap((item) =>
                item.appliedOptions.map((option) => (
                  <tr key={`${item.productId}-${option.optionId}`}>
                    <td className="label">{option.name}</td>
                    <td className="num">{formatKRW(option.amount)}</td>
                  </tr>
                )),
              )}
              <tr className="subtotal">
                <td className="label">소계</td>
                <td className="num">{formatKRW(quote.subtotal)}</td>
              </tr>
              {quote.appliedDiscountName && (
                <tr className="discount">
                  <td className="label">{quote.appliedDiscountName}</td>
                  <td className="num">-{formatKRW(quote.discountAmount)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <dl className="total-box">
            <dt>
              총액
              <small>부가세 포함</small>
            </dt>
            <dd>{formatKRW(quote.totalAmount)}</dd>
          </dl>
          <dl className="detail-grid">
            <dt>계산 시점</dt>
            <dd>{quote.calculatedAt.toLocaleString("ko-KR")}</dd>
            <dt>유효기간</dt>
            <dd>{quote.expiresAt.toLocaleString("ko-KR")}</dd>
            <dt>고객 조회 주소</dt>
            <dd>
              <Link href={`/q/${quote.publicId}`}>/q/{quote.publicId}</Link>
            </dd>
          </dl>
        </div>

        <div className="card">
          <h2>상태 변경</h2>
          <StatusForm
            publicId={quote.publicId}
            currentLabel={statusLabel(quote.storedStatus)}
            nextStatuses={quote.nextStatuses}
          />
        </div>
      </main>
    </>
  );
}
