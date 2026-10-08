/**
 * 검색 기간 경계. 담당자가 넣는 날짜는 한국 날짜고 저장은 UTC 다. (ADR-0015)
 * 서버 타임존에 끌려다니지 않도록 오프셋을 고정한다. 한국은 서머타임이 없다.
 */
const KST_OFFSET = "+09:00";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SearchRange {
  /** 이 시각 이상 */
  from: Date | null;
  /** 이 시각 **미만**. 종료일 당일을 포함하기 위해 다음 날 00:00 이다. */
  until: Date | null;
}

function startOfDayKst(raw: string): Date | null {
  if (!DATE_PATTERN.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00${KST_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * `YYYY-MM-DD` 두 개를 조회 경계로 바꾼다. 해석할 수 없는 값은 조건 없음으로 떨어뜨린다.
 * 종료일은 **당일을 포함한다.** 다음 날 00:00 미만으로 잡는다.
 */
export function parseSearchRange(
  from: string | undefined,
  to: string | undefined,
): SearchRange {
  const start = from ? startOfDayKst(from) : null;
  const end = to ? startOfDayKst(to) : null;

  return {
    from: start,
    until: end === null ? null : new Date(end.getTime() + DAY_MS),
  };
}
