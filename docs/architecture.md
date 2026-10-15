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
                             개인정보 수집 고지 + 필수 동의 체크박스 (ADR-0018)
                             계산 실패(500·네트워크) 시 빈 금액 대신 사유 표시 (ADR-0021)
                             묶음 안내 + 바꾸기 버튼 (서버가 준 선택을 그대로 넣는다, ADR-0037)
  error.tsx                  고객 경로 렌더링 예외 (digest 만 표기, ADR-0021)
  not-found.tsx              없는 주소 · notFound() (ADR-0021)
  q/[publicId]/page.tsx      저장된 견적 조회 (스냅샷 표시, 재계산하지 않음) + 입금 계좌 (ADR-0019)
                             결제 방식 선택 위젯 + 선택 후 안내 (ADR-0033)
                             숨긴 견적은 notFound (ADR-0035)
  q/[publicId]/print/        인쇄 전용 견적서 (브라우저 인쇄 → PDF 저장, ADR-0016)
  admin/
    page.tsx                 가격 규칙 화면 (Server Component)
    error.tsx                관리자 경로 렌더링 예외 (확인할 곳 안내, ADR-0021)
    pricing-admin.tsx        옵션·할인 편집 + 옵션 비활성화 위젯 (Client Component)
                             묶음 관계 추가·삭제 위젯 (수정 없음, ADR-0038)
    quotes/page.tsx          견적 목록 (상태·기간·고객명 검색 · 연락처 마스킹 · 페이지네이션)
                             결제 방식 열 (ADR-0033) · 숨긴 견적 필터 (ADR-0035)
    quotes/[publicId]/       견적 상세 (연락처 전체 · 열람 로그) + 상태 변경 · 복제 위젯
                             결제 방식 · 숨기기/되돌리기 위젯 (ADR-0033, ADR-0035)
    login/                   관리자 로그인
  api/
    estimate/route.ts        금액 계산 (저장하지 않음)
    quotes/route.ts          견적 저장 (서버에서 재계산 후 저장)
    quote/[publicId]/payment-method  고객이 고르는 결제 방식 (공개 경로, ADR-0033)
    admin/                   login · logout · pricing · preview
                             quotes/[publicId]/ status · clone · payment-method · hidden
middleware.ts                /admin 1차 방어 (쿠키 존재만 확인)
src/
  services/
    pricing/
      estimate.ts            진입점. 규칙 조회 후 calculate 호출
      calculate.ts           순수 계산 함수
      constraints.ts         옵션 선택 제약 검증
      options.ts             선택 옵션 금액 합산
      price-selection.ts     한 선택의 소계·할인·총액 (본 계산과 묶음 비교가 같이 쓴다)
      bundle.ts              묶음 안내 판정 · 절약액 · 바꿀 선택 (순수 함수, ADR-0037)
      discount.ts            할인 (조건 판정 → 후보 비교 → 1개 선택)
      rounding.ts            10원 단위 버림
      payment-amount.ts      카드 결제 금액 = 현금가 + 10% (표기 전용, ADR-0039)
      types.ts               계산 입·출력 타입
    quote/
      expiry.ts              유효기간 상수 · 만료 파생 상태 (ADR-0012) · 입금 안내 여부 (ADR-0019)
      transition.ts          상태 전이 허용 여부 (순수 함수, 6절이 기준)
      save-quote.ts          서버 재계산 후 저장 (ADR-0003)
      clone-quote.ts         선택·연락처만 승계하고 금액은 재계산 (ADR-0014)
      search-range.ts        검색 기간 경계 해석 (KST 고정, 순수 함수, ADR-0015)
      get-quote.ts           publicId 로 조회 + 표시 상태 계산 (숨긴 견적은 null)
      payment-method.ts      결제 방식 선택 경유 (REQUESTED 에서만, ADR-0033)
      admin-quotes.ts        관리자 목록·상세·상태 변경·숨기기 경유
      types.ts               견적 입·출력 타입
    catalog/catalog.ts       카탈로그 조회 경유
    privacy/
      retention.ts           보존기간 상수·파기 경계 (순수 함수, ADR-0022)
      purge.ts               파기 실행 경유 (dry-run 포함)
    admin/
      pricing-admin.ts       관리자 조회·미리보기·버전 추가 · 묶음 관계 추가·삭제 (ADR-0038)
      login-throttle.ts      로그인 잠금 판정 (순수 함수. 한도·창 상수, ADR-0020)
      login.ts               실패 기록 조회 → 판정 함수 호출 · 성공/실패 반영
  repositories/
    pricing-rule.ts          유효 버전 가격 규칙 조회
    product.ts               카탈로그 조회 (금액 제외)
    quote.ts                 견적 저장·조회 · 상태 변경 · 숨기기 (감사 로그 동일 트랜잭션)
    pricing-admin.ts         관리자 조회 + 버전 추가 + 옵션 비활성화 (감사 로그 동일 트랜잭션)
    option-bundle.ts         묶음 관계 조회·추가·삭제 (감사 로그 동일 트랜잭션, ADR-0038)
    admin-login-attempt.ts   로그인 실패 기록·집계·오래된 행 삭제 (ADR-0020)
    privacy-purge.ts         연락처 비우기 + 검색어 가리기 (감사 로그 동일 트랜잭션, ADR-0022)
    latest-version.ts        버전 중 유효한 1건 고르기
  lib/
    prisma.ts                PrismaClient 싱글턴
    money.ts                 정수 금액 포맷·만분율 연산 헬퍼
    masking.ts               목록용 연락처 마스킹 (ADR-0013)
    payment-method.ts        결제 방식 목록·라벨 (클라이언트 번들에 들어가므로 lib, ADR-0033)
    order-input.ts           자리 번호 입력 검증 (순수 함수, ADR-0032)
    supplier.ts              견적서 발행처 정보 (ADR-0016) · 입금 계좌 (ADR-0019) — 둘 다 환경변수
    auth.ts                  관리자 권한 판단 (ADR-0011)
    auth-cookie.ts           쿠키 이름 (Edge 런타임용 분리)
    client-ip.ts             요청자 IP (헤더뿐이라 위조 가능, ADR-0020)
    validation/              zod 입력 스키마 (estimate · quote · admin)
prisma/
  schema.prisma
  seed.ts                    상품 4종. 금액은 대부분 임시값 (requirements.md Q-9)
docs/
.claude/rules/
```

아직 만들지 않은 것: 개인정보 파기 배치(ADR-0013), 견적서 이메일 발송(F-5-2 미확정)

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
  │  6) 묶음 안내: 구성 옵션을 전부 고른 선택에 더 싼 묶음이 있으면
  │     바꿀 선택과 절약액을 함께 담는다 (금액에는 넣지 않는다, ADR-0037)
  ↓
계산 결과 (금액 분해 + 사용한 규칙 버전 + 묶음 안내)
  ↓
화면 표시 (계산하지 않고 그대로 출력)
```

- 계산 결과의 금액은 전부 **현금가**다. 소계·할인·총액에 세액을 더하는 단계가 없다. (ADR-0039)
  **카드 결제 금액**은 이 순서 밖에서 `payment-amount.ts` 가 총액으로부터 구하는 표기값이고,
  결제 방식을 고르는 자리에만 적는다. 저장하지 않고 계산 결과에도 담지 않는다.
- 수량은 입력에 없다. 금액은 선택한 옵션의 합으로만 결정된다. (ADR-0008)
- 선택이 없으면 총액 0원이 정상 결과다. 위반 목록이 비어 있는 0원과 계산 거부는 다르다.
- 묶음 안내는 **총액을 바꾸지 않는다.** 바꿀 선택(`nextOptionIds`)을 서버가 정해서 주고,
  고객이 버튼을 누르면 그 선택으로 다시 계산한다. 화면은 무엇을 빼고 더할지 계산하지 않는다. (ADR-0037)
- `/api/estimate`는 **읽기 전용**이다. 아무것도 저장하지 않는다.
- 저장은 `/api/quotes`에서 하고, 저장 시 계산을 **서버에서 다시 수행**한다. 클라이언트가 보낸 금액은 신뢰하지 않는다.
- 저장에는 **개인정보 수집·이용 동의가 전제**다. `privacyConsent` 가 `true` 가 아닌 요청은 400 으로 거부하고,
  동의 시각을 `Quote.privacyConsentAt` 에 남긴다. 복제본은 원본의 동의를 승계한다. (ADR-0018)

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
| Client → 관리자 로그인 | 시도 횟수를 센다. IP별 5회 / 전체 20회(10분)에 닿으면 비밀번호를 비교하지 않고 `429` (ADR-0020) |
| API → Service | API는 금액을 만들지 않는다. DTO 변환과 인증만 한다 |
| Service → Repository | Service는 SQL/Prisma 쿼리를 직접 쓰지 않는다 |
| Repository → DB | Repository는 업무 판단을 하지 않는다. 조건부 금액 로직을 넣지 않는다 |
| DB | 계산을 수행하지 않는다. 트리거·계산 컬럼으로 금액을 만들지 않는다 |
| 예외 → 화면 | 예외 메시지를 화면에 쓰지 않는다. `error.digest` 만 보여준다 (ADR-0021) |

## 6. 상태 전이

```
DRAFT ──→ REQUESTED ──→ CONFIRMED
            ↑  │
            │  └──→ CANCELED
            └──────── 되돌리기
```

허용되는 전이는 위 3개와 **되돌리기 2개**다. 판단은 `src/services/quote/transition.ts`
한 곳에만 있고, 같은 상태로 다시 바꾸는 요청은 거부한다.

```
CONFIRMED ──→ REQUESTED        되돌리기 (ADR-0034)
CANCELED  ──→ REQUESTED
```

잘못 누른 것을 고치는 길이다. 되돌린 뒤에는 다시 확정하거나 취소할 수 있다.
`CONFIRMED` 와 `CANCELED` 가 직접 오가지는 못한다. `REQUESTED` 를 거쳐야 하고,
그래야 감사 로그에 거쳐 간 자리가 두 줄로 남는다.
`DRAFT` 로는 되돌릴 수 없다. 고객이 이미 요청한 사실은 없던 일이 되지 않는다.

되돌리면 `confirmedAt` 을 비운다. 확정 상태가 아닌 견적이 확정 시각을 들고 있으면 거짓이고,
개인정보 보존기간의 기준이 어긋난다. (ADR-0022)

`CONFIRMED` 이후에도 금액·선택 내역은 변경하지 않는다. 되돌리기는 **상태만** 바꾼다.
변경이 필요하면 복제해 새 견적을 만든다.
복제는 선택과 연락처만 승계하고 금액은 복제 시점 규칙으로 다시 계산한다. 원본은 건드리지 않고,
복제본은 `REQUESTED` 로 태어난다. 지금 계산할 수 없는 선택이면 복제하지 않는다. (ADR-0014)

상태 변경은 `누가 · 언제 · 이전값 → 새값`을 감사 로그에 남기고, 변경과 기록은 같은 트랜잭션에서 수행한다.
만료된 견적도 `REQUESTED` 이므로 전이 자체는 가능하다. 만료는 표시 상태일 뿐 저장 상태가 아니다. (ADR-0012)

**숨김(`hiddenAt`)은 상태가 아니다.** (ADR-0035) 전이 표에 들어가지 않고 `status` 와 직교한다.
숨겨도 상태는 그대로이고, 되돌리면 같은 `publicId` 로 다시 열린다. 숨긴 견적은 관리자 목록에서
빠지고 고객 조회(`/q/[publicId]`)도 닫힌다. 행은 지우지 않는다 — 확정 견적의 5년 보존(ADR-0022)과
`publicId` 를 가리키는 감사 로그가 남아 있어야 한다.

`EXPIRED` 는 **저장 상태가 아니다.** (ADR-0012)
`expiresAt < now` 이면 표시 시점에 만료로 간주한다. DB 의 `status` 는 바뀌지 않고, 만료 배치도 없다.
`CONFIRMED` 는 만료되지 않는다.

| 저장된 status | `expiresAt` 경과 | 화면에 보이는 상태 |
| ---- | ---- | ---- |
| `DRAFT` / `REQUESTED` | 전 | 그대로 |
| `DRAFT` / `REQUESTED` | 후 | `EXPIRED` |
| `CONFIRMED` | 무관 | `CONFIRMED` |
| `CANCELED` | 무관 | `CANCELED` |
