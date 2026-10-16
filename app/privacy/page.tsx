import type { Metadata } from "next";
import Link from "next/link";
import { supplierFields } from "@/lib/supplier";

export const metadata: Metadata = {
  title: "개인정보 처리방침 | 컨쇼 플랜",
  description: "컨쇼 플랜의 개인정보 수집·이용에 관한 안내입니다.",
};

/**
 * 개인정보 처리방침 전문. 요청 폼의 요약에서 새 탭으로 열린다. (ADR-0042)
 *
 * 적는 내용은 **실제 정책과 같은 값이어야 한다.** 보유 기간은 ADR-0013,
 * 파기 절차는 ADR-0022 의 배치가 하는 일을 그대로 적는다. 여기에만 있는
 * 약속을 쓰면 고지가 거짓이 된다. (ADR-0018 의 배경)
 *
 * 발행처 정보는 환경변수에서 읽는다. 상호·사업자번호를 코드에 적지 않는다. (ADR-0016)
 */
export default function PrivacyPolicyPage() {
  const fields = supplierFields();

  return (
    <main className="policy">
      <h1>개인정보 처리방침</h1>
      <p className="subtitle">
        컨쇼 플랜 신청 및 결과 제공을 위해 아래와 같이 개인정보를
        수집·이용합니다.
      </p>

      <section>
        <h2>1. 수집하는 개인정보 항목</h2>
        <ul>
          <li>필수: 이름, 휴대전화번호</li>
          <li>선택: 이메일 주소</li>
        </ul>
        <p>
          컨쇼 플랜을 만들기 위해 고객이 고른 상품과 옵션도 함께 저장됩니다.
          선택 내역은 금액 산출의 근거이며 개인을 식별하는 정보가 아닙니다.
        </p>
        <p>
          학생의 성적·생활기록부 등 민감한 정보는 이 화면에서 수집하지
          않습니다.
        </p>
      </section>

      <section>
        <h2>2. 수집·이용 목적</h2>
        <ul>
          <li>신청자 확인</li>
          <li>입력한 조건에 따른 컨쇼 플랜 결과 제공</li>
          <li>상담 일정 안내</li>
          <li>결제 및 환불 처리</li>
        </ul>
      </section>

      <section>
        <h2>3. 보유·이용 기간</h2>
        <ul>
          <li>플랜 생성 후 1년</li>
          <li>
            플랜이 확정된 경우 확정 후 5년 (「전자상거래 등에서의 소비자보호에
            관한 법률」상 계약·결제 기록 보존)
          </li>
        </ul>
        <p>
          기간이 지나면 보유 목적이 사라지므로 지체 없이 파기합니다.
        </p>
      </section>

      <section>
        <h2>4. 파기 절차와 방법</h2>
        <p>
          보유 기간이 지난 개인정보는 자동 파기 작업이 하루 한 번 확인하여
          이름·휴대전화번호·이메일 주소를 복구할 수 없도록 삭제합니다. 금액과
          선택 내역은 개인을 식별하지 않는 거래 기록이므로 함께 지우지
          않습니다.
        </p>
      </section>

      <section>
        <h2>5. 제3자 제공 및 처리위탁</h2>
        <p>
          수집한 개인정보를 제3자에게 제공하거나 판매하지 않습니다. 광고·마케팅
          목적으로 이용하지 않습니다.
        </p>
      </section>

      <section>
        <h2>6. 정보주체의 권리</h2>
        <p>
          고객은 언제든지 자신의 개인정보에 대한 열람·정정·삭제·처리정지를
          요구할 수 있습니다. 아래 문의처로 연락하시면 지체 없이 조치합니다.
        </p>
        <p>
          개인정보 수집·이용 동의를 거부할 수 있습니다. 다만 동의하지 않으면
          신청자 확인이 되지 않아 컨쇼 플랜 결과 제공이 제한됩니다.
        </p>
      </section>

      <section>
        <h2>7. 안전성 확보 조치</h2>
        <ul>
          <li>개인정보를 다루는 관리자 화면은 인증 없이 열리지 않습니다.</li>
          <li>
            고객 연락처를 열람한 기록을 남기며, 목록 화면에서는 연락처를
            가려서 표시합니다.
          </li>
          <li>관리자 로그인 시도 횟수를 제한합니다.</li>
        </ul>
      </section>

      {fields.length > 0 && (
        <section>
          <h2>8. 문의처</h2>
          <dl className="detail-grid">
            {fields.map((field) => (
              <div key={field.label}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <p className="policy-back">
        <Link href="/">컨쇼 플랜 만들기로 돌아가기</Link>
      </p>
    </main>
  );
}
