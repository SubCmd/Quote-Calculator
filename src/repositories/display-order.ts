/**
 * 표시 순서 재배치 판정. 순수 함수다. DB 를 모른다. (ADR-0026)
 *
 * 요청을 **전체 순열**로 받는 이유는 "한 칸 위로" 가 서버가 먼저 읽은 순서에 기대기 때문이다.
 * 관리자가 두 탭에서 동시에 누르면 읽은 순서가 이미 낡은 것이고, 결과가 둘 중 어느 쪽도
 * 아닌 순서가 된다. 전체 순열이면 마지막 요청이 그대로 최종 상태다.
 *
 * 화면과 서버가 같은 판정을 두 군데 적지 않도록 양쪽이 이 파일을 쓴다.
 */

export interface ReorderPlan {
  /** 키 → 새 `sortOrder`. 1 부터 빈틈없이 매긴다. */
  sortOrderByKey: Map<string, number>;
  /** 순서가 실제로 달라졌는지. 같으면 쓰지 않고 감사 기록도 남기지 않는다. */
  changed: boolean;
}

function first(keys: string[]): string {
  return keys[0]!;
}

/**
 * `next` 가 `current` 의 순열인지 확인하고 새 `sortOrder` 를 매긴다.
 *
 * 전체 순열이라서 검증할 것이 하나다. **구성원이 빠짐없이 정확히 한 번씩 들어 있는가.**
 * 누락·중복·바깥 항목은 전부 거부한다. 부분 목록을 받아 나머지를 뒤에 붙이는 식으로
 * 너그럽게 처리하지 않는다. 보내지 않은 항목의 자리를 서버가 추측하는 셈이 된다.
 */
export function planReorder(current: string[], next: string[]): ReorderPlan {
  const currentSet = new Set(current);

  const unknown = next.filter((key) => !currentSet.has(key));
  if (unknown.length > 0)
    throw new Error(
      `순서를 바꿀 수 없는 항목이 들어 있습니다: ${first(unknown)}`,
    );

  const seen = new Set<string>();
  const duplicated = next.filter((key) => {
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
  if (duplicated.length > 0)
    throw new Error(
      `순서 목록에 같은 항목이 두 번 있습니다: ${first(duplicated)}`,
    );

  const missing = current.filter((key) => !seen.has(key));
  if (missing.length > 0)
    throw new Error(`순서 목록에 빠진 항목이 있습니다: ${first(missing)}`);

  return {
    sortOrderByKey: new Map(next.map((key, index) => [key, index + 1])),
    changed: next.some((key, index) => current[index] !== key),
  };
}
