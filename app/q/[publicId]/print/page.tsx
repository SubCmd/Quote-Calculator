import Link from "next/link";
import { notFound } from "next/navigation";
import { formatKRW } from "@/lib/money";
import { supplierAccount, supplierFields } from "@/lib/supplier";
import { splitTax } from "@/services/pricing/tax";
import { acceptsPayment } from "@/services/quote/expiry";
import { getQuote } from "@/services/quote/get-quote";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

function formatDate(value: Date): string {
  return value.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "long",
  });
}

/**
 * 인쇄 전용 견적서. 금액은 저장된 스냅샷을 그대로 쓴다. (ADR-0002, ADR-0016)
 * 조회 주소에 인증이 없으므로 고객 연락처는 넣지 않는다. (ADR-0013)
 */
export default async function QuotePrintPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const quote = await getQuote(publicId, new Date());

  if (!quote) notFound();

  const tax = splitTax(quote.totalAmount);
  const supplier = supplierFields();
  const expired = quote.status === "EXPIRED";
  // 입금받을 수 없는 견적에는 계좌를 찍지 않는다. (ADR-0019)
  const account = acceptsPayment(quote.status) ? supplierAccount() : null;

  return (
    <main className="print-page">
      <nav className="print-actions no-print">
        <Link className="ghost" href={`/q/${quote.publicId}`}>
          견적 화면으로
        </Link>
        <PrintButton />
      </nav>

      <article className="print-sheet">
        <header className="print-head">
          <h1>견 적 서</h1>
          <dl className="print-issue">
            <dt>견적번호</dt>
            <dd>{quote.publicId}</dd>
            <dt>발행일</dt>
            <dd>{formatDate(quote.calculatedAt)}</dd>
            <dt>유효기간</dt>
            <dd>{formatDate(quote.expiresAt)}까지</dd>
          </dl>
        </header>

        {supplier.length > 0 && (
          <section className="print-supplier">
            <h2>발행처</h2>
            <dl>
              {supplier.map((field) => (
                <div key={field.label}>
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {expired && (
          <p className="print-notice">
            유효기간이 지난 견적서입니다. 아래 금액은 발행 당시 기준입니다.
          </p>
        )}

        <table className="print-table">
          <thead>
            <tr>
              <th scope="col">항목</th>
              <th scope="col" className="num">
                금액
              </th>
            </tr>
          </thead>
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
                  <td>{option.name}</td>
                  <td className="num">{formatKRW(option.amount)}</td>
                </tr>
              )),
            )}
          </tbody>
          <tfoot>
            <tr className="subtotal">
              <th scope="row">소계</th>
              <td className="num">{formatKRW(quote.subtotal)}</td>
            </tr>
            {quote.appliedDiscount && (
              <tr className="discount">
                <th scope="row">{quote.appliedDiscount.name}</th>
                <td className="num">-{formatKRW(quote.discountAmount)}</td>
              </tr>
            )}
            <tr className="total">
              <th scope="row">
                총액 <small>부가세 포함</small>
              </th>
              <td className="num">{formatKRW(quote.totalAmount)}</td>
            </tr>
            <tr className="tax">
              <th scope="row">공급가액</th>
              <td className="num">{formatKRW(tax.supplyAmount)}</td>
            </tr>
            <tr className="tax">
              <th scope="row">부가세</th>
              <td className="num">{formatKRW(tax.vatAmount)}</td>
            </tr>
          </tfoot>
        </table>

        {account && (
          <section className="print-account">
            <h2>입금 계좌</h2>
            <dl>
              <div>
                <dt>은행</dt>
                <dd>{account.bankName}</dd>
              </div>
              <div>
                <dt>예금주</dt>
                <dd>{account.holder}</dd>
              </div>
              <div>
                <dt>계좌번호</dt>
                <dd>{account.accountNo}</dd>
              </div>
            </dl>
          </section>
        )}

        <p className="print-foot">
          표시된 모든 금액은 부가세 포함 금액입니다. 공급가액과 부가세는 총액에서
          역산한 표기이며, 총액에 더해지지 않습니다.
        </p>
      </article>
    </main>
  );
}
