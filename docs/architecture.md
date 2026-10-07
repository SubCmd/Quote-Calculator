# 시스템 구성

> 레이어 간 **의존 방향 규칙**은 `.claude/rules/architecture.md`가 기준이다. 이 문서는 그 규칙을 실제 디렉터리와 데이터 흐름으로 옮긴 것이다.

## 1. 전체 구성

```
Browser (Next.js Client Component)
   │  fetch
   ↓
API Route (app/api/**/route.ts)          ← 입력 검증, 인증, 응답 변환
   ↓
Service (src/services/**)                ← 업무 규칙, 금액 계산
   ↓
Repository (src/repositories/**)         ← 데이터 접근만
   ↓
Prisma Client → PostgreSQL
```

각 레이어는 **바로 아래 레이어만** 호출한다. 건너뛰는 호출은 금지한다.

## 2. 디렉터리

고객용 견적 계산·저장·조회와 관리자 가격 관리가 구현되어 있다.

```
app/
  layout.tsx                 루트 레이아웃
  page.tsx                   견적 화면 (Server Component)
  quote-form.tsx             선택 위젯 + 견적 요청 폼 (Client Component, 금액 계산 안 함)
  q/[publicId]/page.tsx      저장된 견적 조회 (스냅샷 표시, 재계산하지 않음)
  admin/
    page.tsx                 가격 규칙 화면 (Server Component)
    pricing-admin.tsx        옵션·할인 편집 위젯 (Client Component)
    quotes/page.tsx          견적 목록 (연락처 마스킹 · 페이지네이션)
    quotes/[publicId]/       견적 상세 (연락처 전체 · 열람 로그) + 상태 변경 위젯
    login/                   관리자 로그인
  api/
    estimate/route.ts        금액 계산 (저장하지 않음)
    quotes/route.ts          견적 저장 (서버에서 재계산 후 저장)
    admin/                   login · logout · pricing · preview · quotes/[publicId]/status
middleware.ts                /admin 1차 방어 (쿠키 존재만 확인)
src/
  services/
    pricing/
      estimate.ts            진입점. 규칙 조회 후 calculate 호출
      calculate.ts           순수 계산 함수
      constraints.ts         옵션 선택 제약 검증
      options.ts             선택 옵션 금액 합산
      discount.ts            할인 (조건 판정 → 후보 비교 → 1개 선택)
      rounding.ts            10원 단위 버림
      tax.ts                 공급가액·세액 역산 (표기 전용)
      types.ts               계산 입·출력 타입
    quote/
      expiry.ts              유효기간 상수 · 만료 파생 상태 (ADR-0012)
      transition.ts          상태 전이 허용 여부 (순수 함수, 6절이 기준)
      save-quote.ts          서버 재계산 후 저장 (ADR-0003)
      get-quote.ts           publicId 로 조회 + 표시 상태 계산
      admin-quotes.ts        관리자 목록·상세·상태 변경 경유
      types.ts               견적 입·출력 타입
    catalog/catalog.ts       카탈로그 조회 경유
    admin/pricing-admin.ts   관리자 조회·미리보기·버전 추가
  repositories/
    pricing-rule.ts          유효 버전 가격 규칙 조회
    product.ts               카탈로그 조회 (금액 제외)
    quote.ts                 견적 저장·조회
    pricing-admin.ts         관리자 조회 + 버전 추가 (감사 로그 동일 트랜잭션)
    latest-version.ts        버전 중 유효한 1건 고르기
  lib/
    prisma.ts                PrismaClient 싱글턴
    money.ts                 정수 금액 포맷·만분율 연산 헬퍼
    masking.ts               목록용 연락처 마스킹 (ADR-0013)
    auth.ts                  관리자 권한 판단 (ADR-0011)
    auth-cookie.ts           쿠키 이름 (Edge 런타임용 분리)
    validation/              zod 입력 스키마 (estimate · quote · admin)
prisma/
  schema.prisma
  seed.ts                    상품 4종. 금액은 대부분 임시값 (requirements.md Q-9)
docs/
.claude/rules/
```

아직 만들지 않은 것: 견적 복제, PDF 출력, 개인정보 파기 배치(ADR-0013)

## 3. 가격 계산 흐름

```
사용자 선택
  │  { productId, optionIds[] }
  ↓
POST /api/estimate
  │  zod 검증 → 계산 입력 DTO
  ↓
PricingService.estimate(input, now)
  │  1) 유효 가격 규칙 조회 (Repository)
  │     할인 조건의 옵션 코드를 현재 버전의 옵션 id로 해석한다 (ADR-0009)
  │  2) 옵션 선택 제약 검증
  │  3) 선택 옵션 금액 합산 → 항목 소계 (10원 버림)
  │  4) 조건 충족 할인 후보 비교 → 최대 할인 1개 적용 (10원 버림)
  │  5) 총액 = 소계 - 할인액
  ↓
계산 결과 (금액 분해 + 사용한 규칙 버전)
  ↓
화면 표시 (계산하지 않고 그대로 출력)
```

- 모든 금액은 부가세 포함이다. 총액에 세액을 더하는 단계가 없다. (ADR-0005)
- 수량은 입력에 없다. 금액은 선택한 옵션의 합으로만 결정된다. (ADR-0008)
- 선택이 없으면 총액 0원이 정상 결과다. 위반 목록이 비어 있는 0원과 계산 거부는 다르다.
- `/api/estimate`는 **읽기 전용**이다. 아무것도 저장하지 않는다.
- 저장은 `/api/quotes`에서 하고, 저장 시 계산을 **서버에서 다시 수행**한다. 클라이언트가 보낸 금액은 신뢰하지 않는다.

## 4. 가격 규칙 버전 관리

```
가격 규칙 수정 요청
  ↓
기존 행을 UPDATE 하지 않는다
  ↓
effectiveFrom 을 가진 새 행 INSERT
  ↓
변경 이력(PricingRuleHistory) 기록
```

조회는 항상 `effectiveFrom <= now()` 중 가장 최신 버전을 쓴다.
견적 저장 시 그 버전 식별자와 계산 입력값을 함께 스냅샷으로 남긴다.

## 5. 경계에서 지키는 것

| 경계 | 책임 |
| ---- | ---- |
| Client → API | 입력 검증은 서버가 한다. 클라이언트 검증은 UX 보조일 뿐이다 |
| API → Service | API는 금액을 만들지 않는다. DTO 변환과 인증만 한다 |
| Service → Repository | Service는 SQL/Prisma 쿼리를 직접 쓰지 않는다 |
| Repository → DB | Repository는 업무 판단을 하지 않는다. 조건부 금액 로직을 넣지 않는다 |
| DB | 계산을 수행하지 않는다. 트리거·계산 컬럼으로 금액을 만들지 않는다 |

## 6. 상태 전이

```
DRAFT ──→ REQUESTED ──→ CONFIRMED
               │
               └──→ CANCELED
```

허용되는 전이는 위 3개뿐이다. 판단은 `src/services/quote/transition.ts` 한 곳에만 있고,
`CONFIRMED`·`CANCELED` 는 종착 상태다. 같은 상태로 다시 바꾸는 요청도 거부한다.

`CONFIRMED` 이후에는 금액·선택 내역을 변경하지 않는다. 변경이 필요하면 복제해 새 견적을 만든다.

상태 변경은 `누가 · 언제 · 이전값 → 새값`을 감사 로그에 남기고, 변경과 기록은 같은 트랜잭션에서 수행한다.
만료된 견적도 `REQUESTED` 이므로 전이 자체는 가능하다. 만료는 표시 상태일 뿐 저장 상태가 아니다. (ADR-0012)

`EXPIRED` 는 **저장 상태가 아니다.** (ADR-0012)
`expiresAt < now` 이면 표시 시점에 만료로 간주한다. DB 의 `status` 는 바뀌지 않고, 만료 배치도 없다.
`CONFIRMED` 는 만료되지 않는다.

| 저장된 status | `expiresAt` 경과 | 화면에 보이는 상태 |
| ---- | ---- | ---- |
| `DRAFT` / `REQUESTED` | 전 | 그대로 |
| `DRAFT` / `REQUESTED` | 후 | `EXPIRED` |
| `CONFIRMED` | 무관 | `CONFIRMED` |
| `CANCELED` | 무관 | `CANCELED` |
