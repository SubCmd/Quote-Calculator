/**
 * `모두 선택` 버튼의 라벨과 동작을 같은 판정에서 만든다. (ADR-0043)
 *
 * 화면이 `every` 를 직접 적으면 라벨과 동작이 따로 바뀔 수 있고, 그때 버튼 글자와
 * 누른 결과가 어긋난다.
 */

/** 그 그룹의 옵션이 **전부** 선택돼 있는가. 옵션이 없는 그룹은 거짓이다. */
export function allSelected(
  groupOptionIds: readonly string[],
  optionIds: readonly string[],
): boolean {
  if (groupOptionIds.length === 0) return false;
  return groupOptionIds.every((id) => optionIds.includes(id));
}

/**
 * 전부 켜져 있으면 전부 끄고, 아니면 전부 켠다.
 * 일부만 켜져 있을 때는 끄지 않고 나머지를 채운다.
 */
export function toggleAll(
  groupOptionIds: readonly string[],
  optionIds: readonly string[],
): string[] {
  if (allSelected(groupOptionIds, optionIds)) {
    return optionIds.filter((id) => !groupOptionIds.includes(id));
  }
  const missing = groupOptionIds.filter((id) => !optionIds.includes(id));
  return [...optionIds, ...missing];
}

/** 자기 상태가 아니라 **지금 누르면 일어날 일**이다. */
export function selectAllLabel(
  groupName: string,
  groupOptionIds: readonly string[],
  optionIds: readonly string[],
): string {
  return allSelected(groupOptionIds, optionIds)
    ? `${groupName} 모두 해제`
    : `${groupName} 모두 선택`;
}
