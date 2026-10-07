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
- 금액 컬럼은 모두 **부가세 포함 금액**이다. 세전 금액 컬럼을 만들지 않는다. (ADR-0005)
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

## 견적 테이블

- 계산 결과 금액 분해값을 모두 컬럼으로 저장한다. 총액만 저장하지 않는다.
- 계산 입력값과 사용한 규칙 버전 식별자를 스냅샷(`Json`)으로 함께 저장한다.
- `CONFIRMED` 이후 금액·선택 내역 컬럼을 변경하는 쿼리를 작성하지 않는다.

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
