/**
 * 견적서에 찍히는 발행처 정보. 환경변수에서만 읽는다. (ADR-0016)
 * 상호·사업자번호는 가격 규칙처럼 자주 바뀌지 않아 DB 와 편집 화면을 두지 않았다.
 */

export interface SupplierField {
  label: string;
  value: string;
}

const FIELDS: { label: string; env: string }[] = [
  { label: "상호", env: "QUOTE_SUPPLIER_NAME" },
  { label: "사업자등록번호", env: "QUOTE_SUPPLIER_REG_NO" },
  { label: "대표자", env: "QUOTE_SUPPLIER_CEO" },
  { label: "주소", env: "QUOTE_SUPPLIER_ADDRESS" },
  { label: "연락처", env: "QUOTE_SUPPLIER_CONTACT" },
];

/**
 * 설정된 항목만 돌려준다. 비어 있어도 출력을 막지 않는다.
 * 금액은 환경변수와 무관하게 맞아야 하고, 개발·테스트 환경에서도 견적서를 볼 수 있어야 한다.
 */
export function supplierFields(): SupplierField[] {
  return FIELDS.flatMap(({ label, env }) => {
    const value = process.env[env]?.trim();
    return value ? [{ label, value }] : [];
  });
}

export interface SupplierAccount {
  bankName: string;
  holder: string;
  accountNo: string;
}

/**
 * 입금 계좌. **세 항목이 모두 있을 때만** 돌려준다. (ADR-0019)
 * 발행처 항목과 달리 부분 결과를 허용하지 않는다.
 * 예금주 없는 계좌번호, 은행 없는 계좌번호로는 입금할 수 없다.
 */
export function supplierAccount(): SupplierAccount | null {
  const bankName = process.env.QUOTE_SUPPLIER_BANK_NAME?.trim();
  const holder = process.env.QUOTE_SUPPLIER_ACCOUNT_HOLDER?.trim();
  const accountNo = process.env.QUOTE_SUPPLIER_ACCOUNT_NO?.trim();

  if (!bankName || !holder || !accountNo) return null;
  return { bankName, holder, accountNo };
}
