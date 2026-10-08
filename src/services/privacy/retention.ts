/**
 * 개인정보 보존기간. ADR-0013 이 정하고 ADR-0022 가 실행한다.
 *
 * 이 숫자를 바꾸면 ADR-0018 의 수집·이용 고지 문구도 같은 값으로 고쳐야 한다.
 * 둘 중 하나만 고치면 고객에게 한 고지가 거짓이 된다.
 */
export const UNCONFIRMED_RETENTION_YEARS = 1;
export const CONFIRMED_RETENTION_YEARS = 5;

/** 보존기간이 지난 행을 고르는 기준 시각. 각각 "이 시각 **미만**" 이다. */
export interface PurgeCutoff {
  /** DRAFT · REQUESTED · CANCELED 는 createdAt 기준 */
  unconfirmedBefore: Date;
  /** CONFIRMED 는 confirmedAt 기준. updatedAt 은 기준이 될 수 없다 */
  confirmedBefore: Date;
  /** 감사 로그에 남은 검색어는 가장 짧은 기간을 따른다 */
  searchLogBefore: Date;
}

/**
 * `now` 에서 `years` 년을 뺀다. UTC 로 계산해 서버 타임존에 끌려다니지 않게 한다.
 *
 * 2월 29일에서 1년을 빼면 3월 1일이 된다(그 해에는 2월 29일이 없다).
 * 경계가 하루 늦게 잡혀 **조금 더 지운다.** 덜 지워서 보관기간을 넘기는 쪽이 위반이므로
 * 이 방향의 오차는 안전한 쪽이다.
 */
function yearsBefore(now: Date, years: number): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear() - years,
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  );
}

export function purgeCutoff(now: Date): PurgeCutoff {
  const unconfirmedBefore = yearsBefore(now, UNCONFIRMED_RETENTION_YEARS);

  return {
    unconfirmedBefore,
    confirmedBefore: yearsBefore(now, CONFIRMED_RETENTION_YEARS),
    searchLogBefore: unconfirmedBefore,
  };
}
