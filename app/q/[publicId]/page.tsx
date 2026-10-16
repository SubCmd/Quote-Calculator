import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import logo from "../../../public/logo.png";
import { formatKRW } from "@/lib/money";
import { supplierAccount } from "@/lib/supplier";
import { cardPaymentAmount } from "@/services/pricing/payment-amount";
import { acceptsPayment } from "@/services/quote/expiry";
import { getQuote } from "@/services/quote/get-quote";
import { paymentMethodLabel } from "@/lib/payment-method";
import { MethodNotice } from "./method-notice";
import { PaymentMethodForm } from "./payment-method-form";

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

  const expired = quote.status === "EXPIRED";
  // 입금받을 수 없는 견적에는 계좌를 띄우지 않는다. (ADR-0019)
  const account = acceptsPayment(quote.status) ? supplierAccount() : null;
  // 고를 수 있는지는 서버가 판단한다. 못 고르는 견적에는 선택 칸을 아예 그리지 않는다. (ADR-0033)
  const canChooseMethod = quote.storedStatus === "REQUESTED";

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-identity">
            <Image
              className="app-logo"
              src={logo}
              alt="컨쇼 로고"
              height={52}
            />
            <div>
              <p className="brand">컨쇼 Conshow 입시컨설팅</p>
              <h1>컨쇼 플랜</h1>
            </div>
          </div>
          <p className="subtitle">
            {formatDateTime(quote.calculatedAt)} 기준 금액입니다. 표시 금액은
            모두 현금가입니다.
          </p>
        </div>
      </header>
      <main>
        <article className="quote-sheet">
          <div className="quote-meta">
            <span className={expired ? "status-badge expired" : "status-badge"}>
              {STATUS_LABEL[quote.status] ?? quote.status}
            </span>
            <span className="quote-id">플랜 번호 {quote.publicId}</span>
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
              <small>현금가</small>
            </dt>
            <dd>{formatKRW(quote.totalAmount)}</dd>
          </dl>

          {account && (
            <section className="account-box" aria-labelledby="account-title">
              <h2 id="account-title">입금 계좌</h2>
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
                  <dd className="account-no">{account.accountNo}</dd>
                </div>
              </dl>
            </section>
          )}

          {canChooseMethod && (
            <section
              className="payment-section"
              aria-labelledby="payment-title"
            >
              <h2 id="payment-title">결제 방식</h2>
              <p className="hint">
                어떻게 진행할지 골라 주세요. 고른 뒤에도 바꿀 수 있습니다.
                {quote.paymentMethod && (
                  <strong>
                    {" "}
                    현재 선택: {paymentMethodLabel(quote.paymentMethod)}
                  </strong>
                )}
              </p>
              <PaymentMethodForm
                publicId={quote.publicId}
                selectedMethod={quote.paymentMethod}
                cashAmount={quote.totalAmount}
                cardAmount={cardPaymentAmount(quote.totalAmount)}
              />
              {quote.paymentMethod && (
                <MethodNotice method={quote.paymentMethod} />
              )}
            </section>
          )}

          <p className="hint">
            유효기간 {formatDateTime(quote.expiresAt)}까지 · 이 주소를
            보관하시면 언제든 다시 확인할 수 있습니다. 주소를 잃어버리셨다면{" "}
            <Link href="/q/lookup">이름과 휴대전화번호로 찾기</Link> 를 이용해
            주세요.
          </p>

          <p className="sheet-actions">
            <Link className="ghost" href={`/q/${quote.publicId}/print`}>
              컨쇼 플랜 인쇄 · PDF로 저장
            </Link>
          </p>
        </article>
      </main>
    </>
  );
}
