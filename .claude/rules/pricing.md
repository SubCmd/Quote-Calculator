# 가격 계산 구현 규칙

업무 규칙(무엇이 맞는 금액인가)은 `docs/pricing-rules.md`가 기준이다. 이 파일은 코드 작성 규약만 다룬다.

## 위치

- 계산 로직은 `src/services/pricing/` 안에만 존재한다.
- 진입점은 둘로 나뉜다.
  - `estimate(input, now)` — `estimate.ts`. Repository로 규칙을 조회한 뒤 `calculate`에 넘긴다. 바깥 레이어는 이 함수만 호출한다.
  - `calculate(input, ruleSet, now)` — `calculate.ts`. **순수 함수.** DB를 모른다.
- UI 컴포넌트, API Route, Repository에 금액 산술을 쓰지 않는다.

## 금액 타입

- 금액은 원 단위 정수(`number` 정수 / Prisma `Int`).
- **모든 금액은 부가세 포함 금액이다.** 세전 금액을 다루는 변수를 만들지 않는다. (ADR-0005)
- **수량 변수를 만들지 않는다.** 금액은 옵션 금액의 합이다. `단가 × 수량` 형태의 식을 쓰지 않는다. (ADR-0008)
- 옵션은 정액만 가진다. 옵션에 요율을 두지 않는다. 요율은 할인 규칙에만 존재한다.
- 요율은 계산 레이어에서 **만분율 정수(bp)** 로만 다룬다. 15% = `1500`. 필드 이름은 `rateBp`.
  DB의 `Decimal`을 bp로 바꾸는 것은 Repository의 책임이다. Service에 `Decimal`이나 소수를 넘기지 않는다.
- 요율 적용은 `applyRate(amount, rateBp)` 하나만 쓴다. `amount * rateBp / 10000` 을 손으로 쓰지 않는다.
- `toFixed`, `Math.round`, `Math.floor` 를 계산 로직에 직접 쓰지 않는다. 반올림은 `rounding.ts`의 10원 단위 버림 함수를 통해서만 한다.

## 계산 함수 규약

- **순수 함수로 작성한다.** 계산 함수 안에서 DB를 조회하지 않는다.
  규칙 조회는 `estimate.ts`에서 Repository로 먼저 수행하고, `calculate`에 값으로 넘긴다.
- 현재 시각을 함수 내부에서 읽지 않는다. `now`를 인자로 받는다. (테스트 고정 목적)
- 같은 입력 → 항상 같은 출력. 랜덤·시각·전역 상태에 의존하지 않는다.

## 결과 형태

계산 결과는 총액만 반환하지 않는다. 항상 분해값과 근거를 함께 반환한다.

```ts
{
  ok: true,
  items: [{ productId, optionAmount, subtotal, appliedOptions }],
  subtotal,                       // 항목 소계 합
  discountAmount,                 // 10원 단위 버림 적용 후
  appliedDiscount,                // 적용된 규칙
  discountCandidates,             // 비교된 후보와 각 할인액
  totalAmount,                    // 부가세 포함 최종 금액
  pricingRuleVersionIds: string[],
  calculatedAt: Date,
}
```

- UI가 표시할 수 있어야 하고, 견적 스냅샷에 그대로 저장할 수 있어야 한다.
- 결과에 `vatAmount`를 계산 산출물로 담지 않는다. 공급가액·세액은 `tax.ts`의 역산 함수로 **표기 시점에** 구한다. (ADR-0005)

## 유효하지 않은 선택

- 옵션 제약 위반은 예외를 던지지 않는다. 금액 없이 위반 목록을 반환한다.

```ts
{ ok: false, violations: [{ code, groupId?, optionIds?, message }] }
```

- 금액 0원으로 처리하지 않는다. "계산 불가"와 "0원"은 다르다.
- **선택이 없어서 0원인 것은 성공이다.** `ok: true`, 위반 목록 없음, 총액 0으로 반환한다. (ADR-0008)
- 시스템 오류(규칙 누락, 해석되지 않는 할인 조건)는 예외를 던진다. 조용히 기본값으로 대체하지 않는다.

## 금지

- 옵션 금액·할인율·할인 조건 하드코딩. 전부 DB에서 읽는다. 테스트 픽스처는 예외.
- 상품 코드로 분기하기. `if (product.code === 'ONESHOT')` 같은 조건문을 쓰지 않는다.
  어떤 조합에 할인이 걸리는지는 DB의 할인 조건이 정한다. (ADR-0009)
- 중간 계산 반올림. 반올림 지점은 항목 소계와 할인액 두 곳뿐이다.
- 총액에 부가세를 더하기. 옵션 금액에 이미 포함되어 있다.
- 할인 후보 중 첫 번째 일치 규칙을 바로 적용하기. 전체 후보의 할인액을 비교해 최대값을 고른다. (ADR-0006)
- 클라이언트가 보낸 금액을 신뢰해 저장하기. 저장 시 서버에서 다시 계산한다.

## 수정 시

계산 결과가 달라지는 변경을 하면 같은 커밋에서:

1. `docs/pricing-rules.md`를 먼저 갱신한다.
2. 경계값 테스트를 추가하거나 갱신한다.
3. `docs/pricing-rules.md` 9절의 기준 예시값이 바뀌면 그 값도 갱신한다.
