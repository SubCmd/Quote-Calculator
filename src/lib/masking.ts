/**
 * 목록 화면용 연락처 마스킹. (`.claude/rules/admin.md`)
 * 전체 값은 상세 화면에서만 보여 주고, 그때 열람 로그를 남긴다.
 * 가리는 쪽이 기본이다. 형식이 예상과 달라도 원본을 그대로 흘리지 않는다.
 */

export function maskName(name: string | null): string {
  if (!name) return "—";
  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed;
  if (trimmed.length === 2) return `${trimmed[0]}*`;
  return `${trimmed[0]}${"*".repeat(trimmed.length - 2)}${trimmed.at(-1)}`;
}

export function maskPhone(phone: string | null): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  // 뒤 4자리만 남긴다. 짧으면 전부 가린다.
  if (digits.length < 8) return "*".repeat(digits.length);
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}

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
