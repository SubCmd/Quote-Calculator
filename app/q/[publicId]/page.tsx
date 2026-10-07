import { notFound } from "next/navigation";
import { formatKRW } from "@/lib/money";
import { splitTax } from "@/services/pricing/tax";
import { getQuote } from "@/services/quote/get-quote";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "작성 중",
  REQUESTED: "요청 접수",
  CONFIRMED: "확정",
  EXPIRED: "유효기간 지남",
  CANCELED: "취소",
};

function formatDateTime(value: Date): string {
  return value.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "long",
    timeStyle: "short",
  });
}

/**
 * 고객이 자기 견적을 다시 보는 화면. 저장된 금액을 그대로 보여준다.
 * 가격 규칙이 바뀌어도 발행 당시 금액이어야 하므로 재계산하지 않는다. (ADR-0002)
 */
export default async function SavedQuotePage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const quote = await getQuote(publicId, new Date());

  if (!quote) notFound();

  const tax = splitTax(quote.totalAmount);
  const expired = quote.status === "EXPIRED";

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <p className="brand">입시 컨설팅</p>
          <h1>견적서</h1>
          <p className="subtitle">
            {formatDateTime(quote.calculatedAt)} 기준 금액입니다. 표시 금액은
            모두 부가세 포함입니다.
          </p>
        </div>
      </header>
      <main>
        <article className="quote-sheet">
          <div className="quote-meta">
            <span className={expired ? "status-badge expired" : "status-badge"}>
              {STATUS_LABEL[quote.status] ?? quote.status}
            </span>
            <span className="quote-id">견적번호 {quote.publicId}</span>
          </div>

          {expired && (
            <p className="expired-note">
              유효기간({formatDateTime(quote.expiresAt)})이 지났습니다. 아래
              금액은 발행 당시 기준이며, 다시 요청해 주세요.
            </p>
          )}

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
              {quote.appliedDiscount && (
                <tr className="discount">
                  <td className="label">{quote.appliedDiscount.name}</td>
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
          {quote.totalAmount > 0 && (
            <p className="tax-note">
              공급가액 {formatKRW(tax.supplyAmount)} · 부가세{" "}
              {formatKRW(tax.vatAmount)}
            </p>
          )}

          <p className="hint">
            유효기간 {formatDateTime(quote.expiresAt)}까지 · 이 주소를
            보관하시면 언제든 다시 확인할 수 있습니다.
          </p>
        </article>
      </main>
    </>
  );
}
