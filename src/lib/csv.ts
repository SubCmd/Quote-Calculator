/**
 * CSV 문자열 변환. (ADR-0050)
 *
 * 금액도 DB 도 모르는 순수 변환이다. 받은 문자열을 그대로 칸에 넣는다.
 * 포맷(쉼표·`원`)은 부르는 쪽이 하지 않는다. 파일은 엑셀이 더할 수 있는 숫자를 담는다.
 */

/** 엑셀은 BOM 이 없으면 CP949 로 읽어서 한글이 전부 깨진다. */
const BOM = "\uFEFF";

/** RFC 4180 이고 엑셀이 기대하는 줄 끝이다. */
const CRLF = "\r\n";

/**
 * 엑셀이 수식으로 읽는 선두 문자. 고객이 적은 이름이 이 글자로 시작하면
 * 파일을 연 담당자의 PC 에서 실행을 묻는 창이 뜬다.
 */
const FORMULA_LEADS = ["=", "+", "-", "@", "\t", "\r"];

function cell(value: string): string {
  const guarded = FORMULA_LEADS.some((lead) => value.startsWith(lead))
    ? `'${value}`
    : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/**
 * 머리글과 행을 CSV 한 장으로 만든다.
 *
 * 모든 칸을 따옴표로 감싼다. 쉼표·줄바꿈이 든 값을 따로 분기하지 않는다.
 * 수식 방어는 **모든 칸**에 건다. 위험한 칸을 사람이 골라내는 방식은
 * 칸이 하나 늘 때 깨진다.
 */
export function toCsv(
  header: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const lines = [header, ...rows].map((cells) => cells.map(cell).join(","));
  return BOM + lines.join(CRLF) + CRLF;
}
