/**
 * 순서 번호 입력을 키 순열로 바꾼다. 순수 함수다. (ADR-0026, ADR-0032)
 *
 * 관리자는 각 줄에 보일 자리 번호를 적는다. 서버로 가는 것은 번호가 아니라 **키 순열**이고
 * (`planReorder`), 번호를 순열로 바꾸는 판정이 이 함수다. 화면이 조건문을 직접 들고 있지
 * 않도록 떼어 두었다.
 *
 * 너그럽게 처리하지 않는다. 빈칸·중복·범위 밖이면 사유를 돌려주고 키를 만들지 않는다.
 * 빠진 번호의 자리를 추측해 채우면 관리자가 적지 않은 순서가 저장된다.
 */

export interface OrderInputResult {
  /** 번호 순으로 줄 세운 키. 입력이 순열이 아니면 `null`. */
  keys: string[] | null;
  /** 사람이 읽을 사유. 유효하면 `null`. */
  error: string | null;
}

/** `1`, `02` 는 받고 빈칸·`1.5`·`-1`·`1a` 는 받지 않는다. */
function parsePosition(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

export function resolveOrderInput(
  entries: { key: string; value: string }[],
): OrderInputResult {
  const count = entries.length;
  const reject = (error: string): OrderInputResult => ({ keys: null, error });

  const positions: { key: string; position: number }[] = [];
  for (const entry of entries) {
    const position = parsePosition(entry.value);
    if (position === null || position < 1 || position > count)
      return reject(`번호는 1부터 ${count} 사이의 정수로 넣으세요.`);
    positions.push({ key: entry.key, position });
  }

  // 번호가 모두 1~N 안에 있고 개수가 N 이므로, 중복과 누락은 언제나 함께 생긴다.
  // 둘 다 알려준다. 겹친 것만 보여주면 어디를 비웠는지 찾아야 한다.
  const seen = new Set<number>();
  const duplicated = positions
    .map((p) => p.position)
    .filter((position) => {
      if (seen.has(position)) return true;
      seen.add(position);
      return false;
    });
  if (duplicated.length > 0) {
    const missing = Array.from(
      { length: count },
      (_, i) => i + 1,
    ).filter((position) => !seen.has(position));
    // 조사(이/가)는 숫자를 읽는 방식에 따라 달라진다. 숫자 뒤에 조사를 붙이지 않는다.
    return reject(
      `번호가 겹칩니다. 겹친 번호 ${Math.min(...duplicated)}, 빠진 번호 ${Math.min(...missing)}.`,
    );
  }

  return {
    keys: positions
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((p) => p.key),
    error: null,
  };
}
