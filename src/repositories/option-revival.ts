/**
 * 옵션을 되살릴 때 함께 켜도 되는 할인을 가린다. (ADR-0023)
 *
 * 비활성화는 옵션과 그 옵션을 조건으로 쓰는 할인을 함께 끈다(ADR-0017). 되살릴 때
 * 그대로 뒤집을 수 없는 경우가 있다. 한 할인이 조건 옵션을 여러 개 가질 수 있고,
 * 그 중 다른 옵션이 **아직 꺼져 있으면** 할인을 켜는 순간 `findRuleSet` 이 조건을
 * 해석하지 못해 그 상품 계산이 통째로 실패한다(ADR-0009).
 *
 * 확인 화면과 저장이 같은 판정을 써야 해서 순수 함수로 떼어 둔다.
 * 조건문을 두 곳에 적으면 화면이 약속한 것과 서버가 한 일이 갈라진다.
 */

/** `${groupCode}:${optionCode}`. 옵션을 가리키는 키는 코드 쌍이다. 행 id 가 아니다. */
export type OptionKey = string;

export function optionKey(groupCode: string, optionCode: string): OptionKey {
  return `${groupCode}:${optionCode}`;
}

export interface RevivalCandidate {
  code: string;
  name: string;
  conditions: { groupCode: string; optionCode: string }[];
}

export interface RevivalPlan {
  /** 조건 옵션이 전부 활성이 되므로 함께 켠다 */
  revivable: { code: string; name: string }[];
  /** 아직 꺼진 조건 옵션이 남아 끈 채로 두는 할인 */
  blocked: { code: string; name: string; missing: OptionKey[] }[];
}

/**
 * @param candidates 되살리는 옵션을 조건으로 쓰는 **비활성** 할인들. 같은 code 의 여러 버전이 섞여 와도 된다.
 * @param activeOptionKeys 지금 활성인 옵션 키 집합
 * @param revivingKey 지금 되살리는 옵션 키. 활성으로 간주한다
 */
export function planDiscountRevival(
  candidates: RevivalCandidate[],
  activeOptionKeys: Set<OptionKey>,
  revivingKey: OptionKey,
): RevivalPlan {
  const plan: RevivalPlan = { revivable: [], blocked: [] };
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (seen.has(candidate.code)) continue;
    seen.add(candidate.code);

    const missing = [
      ...new Set(
        candidate.conditions
          .map((c) => optionKey(c.groupCode, c.optionCode))
          .filter((key) => key !== revivingKey && !activeOptionKeys.has(key)),
      ),
    ];

    if (missing.length === 0) {
      plan.revivable.push({ code: candidate.code, name: candidate.name });
    } else {
      plan.blocked.push({
        code: candidate.code,
        name: candidate.name,
        missing,
      });
    }
  }

  return plan;
}
