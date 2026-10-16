import type { PaymentMethod } from "@prisma/client";
import { supplierContact } from "@/lib/supplier";

/**
 * 결제 방식을 고른 뒤 보이는 안내. 상호작용이 없어 Server Component 다.
 *
 * 어느 방식에도 "신청" 버튼을 두지 않는다. 방식을 고른 것 자체가 신청이고,
 * 담당자는 관리자 화면에서 그 선택을 본다. 눌러도 아무 일도 하지 않는 버튼은
 * 접수된 것으로 읽히게 만든다.
 *
 * 금액을 적지 않는다. 방식별 지불 금액은 바로 위 선택 버튼에 이미 있고(ADR-0039),
 * 같은 숫자를 두 번 적으면 한쪽만 고쳤을 때 어긋난다.
 */
export function MethodNotice({ method }: { method: PaymentMethod }) {
  const contact = supplierContact();

  return (
    <div className="method-notice">
      {method === "BANK_TRANSFER" && (
        <>
          <h3>입금 안내</h3>
          <p>위 계좌로 입금해 주세요. 입금이 확인되면 담당자가 연락드립니다.</p>
        </>
      )}

      {method === "CARD" && (
        <>
          <h3>카드 결제 신청 안내</h3>
          <p>
            카드 결제 금액은 현금가에 부가세 10%가 더해진 금액입니다. 담당자가
            결제 링크를 보내드립니다. 링크를 받으시면 카드로 결제해 주세요.
          </p>
        </>
      )}

      {method === "CONSULTATION" && (
        <>
          <h3>상담 신청이 접수되었습니다</h3>
          <p>담당자가 남겨 주신 연락처로 연락드립니다.</p>
        </>
      )}

      {contact && (
        <dl className="detail-grid">
          <dt>문의</dt>
          <dd>{contact}</dd>
        </dl>
      )}
    </div>
  );
}
