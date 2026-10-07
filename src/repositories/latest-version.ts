/**
 * 같은 논리 규칙의 여러 버전 중 키별 첫 행만 남긴다. (ADR-0002)
 * 호출 전에 effectiveFrom 내림차순으로 정렬되어 있어야 한다.
 *
 * 카탈로그 조회와 규칙 조회가 같은 버전을 고르지 않으면
 * 화면이 보낸 옵션 식별자를 계산 쪽에서 못 찾는다. 두 곳이 이 함수를 공유해야 한다.
 */
export function latestPerKey<T>(rows: T[], key: (row: T) => string): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const k = key(row);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
