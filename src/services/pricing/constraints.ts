import type { RuleSet, Violation } from "./types";

/**
 * 옵션 선택 제약 검증. (docs/pricing-rules.md 5절)
 * 위반은 예외가 아니라 목록으로 반환한다. 금액 0원과 구분해야 한다.
 * 선택이 비어 있는 것 자체는 위반이 아니다. (ADR-0008)
 */
export function validateSelection(
  ruleSet: RuleSet,
  optionIds: string[],
): Violation[] {
  const violations: Violation[] = [];
  const { groups, options } = ruleSet;

  const optionById = new Map(options.map((o) => [o.id, o]));
  const unknownIds = optionIds.filter((id) => !optionById.has(id));
  if (unknownIds.length > 0) {
    violations.push({
      code: "UNKNOWN_OPTION",
      optionIds: unknownIds,
      message: "존재하지 않거나 이 상품에 적용할 수 없는 옵션입니다.",
    });
    return violations;
  }

  const selected = optionIds.map((id) => optionById.get(id)!);
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const groupsWithSelection = new Set(selected.map((o) => o.groupId));

  for (const group of groups) {
    const inGroup = selected.filter((o) => o.groupId === group.id);

    if (group.required && inGroup.length === 0) {
      violations.push({
        code: "REQUIRED_GROUP_EMPTY",
        groupId: group.id,
        message: `'${group.name}' 항목을 선택해 주세요.`,
      });
    }

    if (group.singleSelect && inGroup.length > 1) {
      violations.push({
        code: "MULTIPLE_IN_SINGLE_GROUP",
        groupId: group.id,
        optionIds: inGroup.map((o) => o.id),
        message: `'${group.name}' 항목은 하나만 선택할 수 있습니다.`,
      });
    }

    // 둘 다 비어 있는 것은 위반이 아니다. 선행이 빈 채로 고른 것만 위반이다. (ADR-0010)
    if (group.dependsOnGroupId !== null && inGroup.length > 0) {
      const prerequisite = groupById.get(group.dependsOnGroupId);
      if (!prerequisite) {
        throw new Error(
          `선행 그룹을 찾을 수 없습니다: ${group.dependsOnGroupId}`,
        );
      }
      if (!groupsWithSelection.has(prerequisite.id)) {
        violations.push({
          code: "GROUP_PREREQUISITE_UNMET",
          groupId: group.id,
          optionIds: inGroup.map((o) => o.id),
          message: `먼저 '${prerequisite.name}' 항목을 선택해 주세요.`,
        });
      }
    }
  }

  return violations;
}
