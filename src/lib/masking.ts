/**
 * 연락처 표기. 이름·휴대폰은 관리자 화면에서 가리지 않는다. (ADR-0047)
 * 관리자 경로 전체가 로그인 뒤에 있고, 전화를 걸 사람이 보는 화면이다.
 */

export function maskEmail(email: string | null): string {
  if (!email) return "—";
  const at = email.indexOf("@");
  if (at <= 0) return "*".repeat(email.length);
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0]}*${domain}`;
  return `${local.slice(0, 2)}${"*".repeat(local.length - 2)}${domain}`;
}

/** 휴대폰 번호는 숫자만 저장한다. 보여 줄 때만 하이픈을 넣는다. */
export function formatPhone(phone: string | null): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11)
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}
