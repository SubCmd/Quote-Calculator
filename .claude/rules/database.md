# 데이터베이스 규칙

PostgreSQL + Prisma. 스키마는 `prisma/schema.prisma`.

## 타입

| 용도 | 타입 |
| ---- | ---- |
| 금액 | `Int` (원 단위) |
| 요율 | `Decimal @db.Decimal(7, 4)` |
| 식별자 | `String @id @default(cuid())` |
| 시각 | `DateTime` (UTC 저장) |
| 열거값 | Prisma `enum` |

- 금액에 `Float`/`Decimal`을 쓰지 않는다. (ADR-0001)
- 요율 `Decimal`은 DB 저장 형식일 뿐이다. Repository가 읽는 즉시 **만분율 정수(bp)** 로 바꿔 Service에 넘긴다.
  `0.1500` → `1500`. Service 쪽으로 `Decimal`이나 소수를 흘려보내지 않는다.
- 금액 컬럼은 모두 **현금가**다. 세전 금액 컬럼도 카드 금액 컬럼도 만들지 않는다. (ADR-0039)
  카드 금액은 현금가에서 언제든 다시 구하므로 저장하지 않는다. 두 곳에 두면 한쪽만 바뀐다.
- 상태·종류 값을 자유 문자열로 두지 않는다. `enum`으로 선언한다.

## 네이밍

- 모델명: 단수 PascalCase (`Quote`, `PricingRule`)
- 필드명: camelCase
- 테이블·컬럼 물리명: `@@map` / `@map`으로 snake_case 지정
- 금액 필드는 `~Amount` 또는 `~Price`, 요율은 `~Rate`로 끝낸다

## 필수 컬럼

모든 모델은 `createdAt`, `updatedAt`을 가진다.
사용자 행위로 생성·변경되는 모델은 `createdBy`를 가진다.

## 가격 규칙 테이블

- `effectiveFrom DateTime` 필수.
- 수정은 `UPDATE`가 아니라 새 행 `INSERT`. (ADR-0002)
- 삭제는 하지 않는다. `isActive false` 또는 종료 버전 추가로 처리한다.
- 조회 인덱스: `@@index([productId, effectiveFrom])`
- 할인 규칙은 `priority Int`를 가진다. 할인액 동률 시 선택 기준이다. (ADR-0006)
- 수량 컬럼(`quantity`, `minQty`, `maxQty`)과 구간 테이블을 만들지 않는다. (ADR-0008)
- 할인 적용 조건은 옵션 **코드**로 저장한다. 옵션 행 id로 저장하면 가격 버전을 추가할 때 조건이 구 버전을 가리킨다. (ADR-0009)
- 옵션 그룹은 버전 테이블이 아니다(`effectiveFrom` 없음). 그룹 간 선행 관계(`dependsOnGroupId`)는
  행 id로 가리키고 외래 키를 건다. 버전이 바뀌지 않으므로 코드로 우회할 이유가 없다. (ADR-0010)
- 선행 조건을 옵션 하나로 좁히는 `dependsOnOptionCode` 는 **코드**로 가리킨다. (ADR-0044)
  같은 행에 있어도 가리키는 대상이 버전 테이블(`ProductOption`)이라 id 가 바뀐다. (ADR-0009와 같은 이유)
  외래 키를 걸 수 없고 조회 시점에 해석한다. **해석되지 않으면 그 그룹을 잠근다.**
  할인 조건처럼 던지지 않는다. 조건을 못 읽을 때 과하게 파는 쪽이 아니라 팔지 않는 쪽이 안전하다.
  `dependsOnGroupId` 가 없으면 뜻이 없다. 코드만 있는 행을 만들지 않는다.

## 묶음 관계 테이블 (ADR-0037)

- `OptionBundle` + `OptionBundleComponent`. `DiscountRule` + `DiscountCondition` 과 같은 모양이다.
- **가격 규칙 테이블이 아니다.** `effectiveFrom` 을 두지 않고 수정은 `UPDATE`·`DELETE` 다.
  안내는 과거 견적의 근거가 아니다. 견적에 남는 것은 고객이 실제로 고른 옵션뿐이다.
- **금액 컬럼을 두지 않는다.** 묶음 금액은 그 옵션 자신의 정액이다. (ADR-0026)
  여기에 금액을 넣으면 옵션 금액과 두 곳에 같은 값이 생기고 한쪽만 바뀐다.
- 옵션은 `(groupCode, optionCode)` 로 가리킨다. 행 id 는 금액 버전마다 바뀐다. (ADR-0009와 같은 이유)
- `isActive` 를 두지 않는다. 안내를 끄는 것은 행을 지우는 것이다.
- **옵션을 비활성화할 때 묶음 행을 지우지 않는다.** 재활성화하면 안내가 그대로 돌아와야 한다.
  (ADR-0025 가 설명 행을 지우지 않는 것과 같다)

## 설명 문구 테이블 (ADR-0025)

- 설명은 **가격 규칙 테이블이 아니다.** 위 절의 "수정은 새 행 `INSERT`" 가 적용되지 않는다.
  `OptionGroup.summary`/`detail` 은 `UPDATE`, `OptionDescription` 은 `upsert` 로 고친다.
- 옵션 설명을 `ProductOption` 컬럼으로 넣지 않는다. 그 테이블은 금액 버전 테이블이라
  문구 오타를 고칠 때마다 가격 버전 행이 쌓이고, 금액 이력을 읽을 수 없게 된다.
- `OptionDescription` 은 옵션을 `(groupId, optionCode)` 로 가리킨다. 옵션 행 id 는 버전마다
  바뀌므로 쓸 수 없고(ADR-0009와 같은 이유), `OptionGroup` 은 버전 테이블이 아니라서
  행 id 가 안정적이다(ADR-0010). 그래서 `groupId` 에는 외래 키를 건다.
- 설명에 `effectiveFrom` 을 두지 않는다. 설명은 과거 견적의 근거가 아니라 현재 안내문이다.
  변경 기록은 `AuditLog` 의 `DESCRIPTION_UPDATED` 가 담당한다.
- 옵션을 비활성화할 때 설명 행을 지우지 않는다. 재활성화하면 문구가 그대로 돌아와야 한다.

## 견적 테이블

- 계산 결과 금액 분해값을 모두 컬럼으로 저장한다. 총액만 저장하지 않는다.
- 계산 입력값과 사용한 규칙 버전 식별자를 스냅샷(`Json`)으로 함께 저장한다.
- `CONFIRMED` 이후 금액·선택 내역 컬럼을 변경하는 쿼리를 작성하지 않는다.
- 목록 정리는 `hiddenAt` 으로 한다. (ADR-0035) `hiddenAt` 은 상태가 아니라 표시 여부다.
  `status` 와 섞지 않고, 숨겨도 `status` 는 그대로다. 목록 조회는 `hiddenAt: null` 을 기본
  조건으로 둔다. 파기 대상 조회는 `hiddenAt` 을 보지 않는다.
- **행 삭제는 `REQUESTED` · `CANCELED` 만이다.** (ADR-0041) `CONFIRMED` 를 지우는 쿼리를
  작성하지 않는다. 확정 건은 `confirmedAt` 기준 5년 보존 의무가 있다. (ADR-0022)
  `where` 에 상태 조건을 반드시 넣고, 그 판정을 화면 비활성에 맡기지 않는다.
- 삭제와 `QUOTE_DELETED` 감사 로그는 **같은 트랜잭션**이다. 로그에 연락처를 담지 않는다.
  `publicId` 와 상품·금액만 적는다. 파기한 데이터를 로그로 되살리지 않는다.
- 소프트 삭제 컬럼(`deletedAt`)을 추가하지 않는다. `hiddenAt` 과 뜻이 겹친다.
- `CONFIRMED` 를 떠나는 전이는 같은 쿼리에서 `confirmedAt = null` 을 쓴다. (ADR-0034)

## 쿼리

- Prisma Client 호출은 `src/repositories/` 안에서만 한다. Service·API Route·컴포넌트에서 직접 호출하지 않는다.
- `PrismaClient`는 `src/lib/prisma.ts` 싱글턴만 사용한다. 새 인스턴스를 만들지 않는다.
- 금액을 바꾸는 작업과 이력 기록은 같은 트랜잭션(`$transaction`)에서 수행한다.
- 목록 조회는 항상 페이지네이션을 적용한다. 무제한 `findMany` 금지.
- `select`로 필요한 필드만 가져온다. 개인정보 필드는 필요한 화면에서만 조회한다.

## 계산 금지

- DB에서 금액을 만들지 않는다. 트리거, 생성 컬럼(generated column), 집계 뷰로 금액을 산출하지 않는다.
- `RAW` 쿼리로 금액 계산을 하지 않는다.

## 마이그레이션

- 스키마 변경은 항상 마이그레이션 파일로 남긴다. `db push`로 운영 스키마를 바꾸지 않는다.
- 마이그레이션 파일을 생성 후 수동 편집하지 않는다. 잘못되면 새 마이그레이션을 추가한다.
- 컬럼 삭제·타입 변경은 데이터 이관 단계를 포함해 분리된 마이그레이션으로 수행한다.
- 운영 데이터가 있는 테이블에 `NOT NULL` 컬럼을 추가할 때는 기본값 또는 백필을 함께 넣는다.
