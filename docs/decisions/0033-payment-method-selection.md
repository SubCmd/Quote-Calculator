# ADR-0033. 결제 방식은 고객이 공개 링크에서 고르고, 상태 변경은 담당자가 손으로 한다

- 상태: 수락됨
- 날짜: 2026-10-13
- 관련: ADR-0013, ADR-0016, ADR-0021, ADR-0022

## 배경

견적을 받은 고객이 "그래서 어떻게 결제하느냐" 를 물어 오면 담당자가 전화로 답하고 있었다.
입금·카드·상담 세 갈래가 있고, 어느 쪽을 고를지는 고객이 정하는데 그 선택이 아무 데도
남지 않았다. 담당자는 통화 기록을 보고 기억에 의존해 다음 일을 했다.

결제 자체를 붙이는 일(결제선생 연동)은 별개다. 가맹점 코드·시크릿이 아직 없다.

## 결정

### 1. 선택지는 세 개이고 한 곳에만 적는다

| 값 | 라벨 | 설명 |
| ---- | ---- | ---- |
| `BANK_TRANSFER` | 입금 | 계좌로 입금 후 담당자 연락 |
| `CARD` | 카드결제 | 담당자가 결제 링크를 보내드립니다 |
| `CONSULTATION` | 상담하기 | 담당자와 상담 후 결정 |

`src/lib/payment-method.ts` 의 `PAYMENT_METHOD_CHOICES` 하나이고 고객 화면과
관리자 화면이 같은 배열을 쓴다. `paymentMethodLabel` 도 거기 있다. 화면에 `enum` 값을
그대로 쓰지 않는다.

### 2. 고객이 자기 공개 링크에서 직접 고른다

`PATCH /api/quote/[publicId]/payment-method` 는 인증이 없는 공개 경로다. 보호는
`publicId` 가 추측 불가능한 것(ADR-0013)에 의존한다. 그 주소를 가진 사람은 그 견적의
고객이다. 쓰는 칸은 `paymentMethod` 하나이고 금액·선택 내역은 건드리지 않는다.

담당자도 `PATCH /api/admin/quotes/[publicId]/payment-method` 로 대신 고를 수 있다.
전화로 들었을 때를 위한 것이다. **둘 다 같은 Service(`selectPaymentMethod`) 를 쓰고**
`actor` 만 `"customer"` / `"admin"` 으로 다르다.

### 3. `REQUESTED` 에서만 고칠 수 있다

그 외 상태면 `422` 다. 화면도 서버가 준 `storedStatus` 로 선택 영역 자체를 그리지 않는다.
확정·취소된 견적의 결제 방식이 바뀌는 경로를 두지 않는다.

낙관적 동시성은 `updateMany({ where: { publicId, status: "REQUESTED" } })` 의 `count` 로
본다. 읽은 뒤 상태가 바뀌었으면 `0` 이고 `409` 다. "읽을 때는 됐는데 쓸 때는 아니었다" 를
`422` 와 섞지 않는다. 고객이 할 일이 다르다 — 전자는 새로 고치면 되고 후자는 문의해야 한다.

### 4. 선택은 감사 로그에 남는다

`PAYMENT_METHOD_SELECTED` 이고 `beforeValue`/`afterValue` 에 이전 방식과 새 방식을 담는다.
본 작업과 같은 트랜잭션이다. 고객이 골라도 남는다 — `actor` 가 `"customer"` 다.

### 5. 결제 완료 판정은 담당자가 손으로 한다

입금 확인도 카드 결제 확인도 사람이 보고 상태를 바꾼다. 결제 방식 선택이 상태를 자동으로
`CONFIRMED` 로 옮기지 않는다.

### 6. 방식을 고른 뒤에는 안내문만 보여준다

`MethodNotice` 는 Server Component 이고 제출 버튼이 없다. **고르는 행위가 곧 요청이다.**
계좌번호·연락처는 환경변수에서 읽는다(ADR-0016). 없으면 그 줄을 그리지 않는다.

## 이유

### 왜 고객에게 공개 링크에서 고르게 하는가

담당자만 고를 수 있으면 고객은 여전히 전화를 해야 하고, 선택이 남는 시점이 통화 이후다.
해결하려던 문제가 그대로 남는다.

공개 경로에 쓰기를 여는 것은 신중할 일이지만, 이 쓰기는 **금액을 바꾸지 않는다.**
최악의 경우는 링크를 가진 사람이 방식을 여러 번 번갈아 고르는 것이고, 그 결과는 감사 로그에
줄이 쌓이는 것뿐이다. `publicId` 를 가진 사람은 그 견적의 고객이므로 실질적으로 자기 선택을
바꾸는 것이다.

### 왜 라벨 목록이 Service 가 아니라 `src/lib/` 에 있는가

처음에는 고객 화면과 관리자 화면이 각자 배열을 들고 있었다. 설명 문구가 한쪽에서만
고쳐지면 같은 선택지가 두 화면에서 다르게 설명된다. 그래서 한 곳으로 모았는데,
처음 둔 곳은 Service 였다.

그 선택은 빌드에서 깨졌다. 선택 버튼은 클라이언트 컴포넌트이고, Service 를 import 하면
Repository → `src/lib/prisma.ts` → `node:crypto` 까지 딸려 와서 클라이언트 번들에
들어갈 수 없다. **배열과 라벨 함수는 DB 를 모르는 순수 데이터다.** `src/lib/` 가 맞는
자리이고, Service 는 감사 로그 요약문("… 결제 방식 **입금** 선택")을 만들 때 거기서
`paymentMethodLabel` 을 가져다 쓴다.

레이어 방향(`.claude/rules/architecture.md`)은 그대로다. 화면이 Service 를 건너뛰고
Repository 를 부르는 것이 아니라, 양쪽이 같은 상수를 참조한다. 쓰기는 여전히 API → Service 다.

### 왜 `paymentMethodLabel` 이 모르는 값에 예외를 던지는가

`enum` 에 값을 추가하고 `PAYMENT_METHOD_CHOICES` 를 잊으면 화면에 빈칸이나 `undefined` 가
그려지는 대신 즉시 터진다. 그리고 테스트가 그 전에 잡는다 — `모든 PaymentMethod 값에
라벨이 있다` 가 `Object.values(PaymentMethod)` 와 대조한다.

### 왜 응답 본문에 사유 문장을 담지 않는가

ADR-0021 이다. `/q/[publicId]` 는 인증 없는 공개 페이지라서 서버가 만든 문장을 그대로
그리면 안 된다. 화면은 **상태 코드만 보고** 고정 문구를 고른다. Service 의 결과도
`reason: "not-found" | "not-allowed" | "conflict"` 뿐이고 메시지를 만들지 않는다.

### 왜 카드결제를 "담당자가 결제 링크를 보내드립니다" 로 적는가

결제선생은 실제로 그렇게 동작한다. 가맹점이 링크를 발급해 보내고 고객이 그 링크에서
결제한다. 자격증명이 없는 지금, 화면에 결제창을 띄우는 흉내를 내는 것보다 운영 방식을
그대로 적는 것이 정확하다.

## 하지 않기로 한 것

- **클라이언트가 보낸 결제 결과를 신뢰해 저장하기.** 공개 경로에서 `impUid` 와
  `status: "paid"` 를 받아 쓰면 링크를 가진 누구나 결제 기록을 위조할 수 있다.
  PG 서버 검증 없는 결제 확인 엔드포인트를 두지 않는다.
- **동작하지 않는 카드 결제창·상담 신청 폼.** 자격증명 없이 띄우는 결제창과,
  로컬 상태만 바꾸고 아무것도 저장하지 않는 "신청 완료" 는 고객에게 거짓말이다.
- **결제 방식 선택으로 상태를 자동 전이하기.** 입금을 확인한 것이 아니다.
- **고객이 고른 뒤 다시 못 고치게 잠그기.** 잘못 누를 수 있고 `REQUESTED` 동안에는
  바꿀 수 있어야 한다. 바꾼 기록은 남는다.
- **응답에 남은 시도 횟수나 상세 사유를 넣기.** ADR-0021.
- **공개 엔드포인트에 요청 제한을 걸기.** `publicId` 가 추측 불가능하므로 호출자는 그
  견적의 고객이다. 로그인(ADR-0020)과 달리 맞혀서 얻을 것이 없다. 감사 로그가 비정상적으로
  쌓이면 그때 다시 본다.

## 영향

- `prisma/schema.prisma`: `enum PaymentMethod`, `Quote.paymentMethod`,
  `AuditAction.PAYMENT_METHOD_SELECTED`, `Payment` 모델.
- `src/lib/payment-method.ts`(선택지·라벨, 순수)와 테스트가 새로 생긴다.
- `src/services/quote/payment-method.ts` 에 `selectPaymentMethod` 가 있다.
  `admin-quotes.ts` 가 아니다 — 고객과 관리자 양쪽이 쓴다.
- `src/repositories/quote.ts`: `updateQuotePaymentMethod` 가 감사 로그를 같은 트랜잭션에
  남긴다. `QuoteRow`·`SavedQuote` 가 `paymentMethod` 와 `storedStatus` 를 가진다.
- `app/q/[publicId]/`: `payment-method-form.tsx`(클라이언트), `method-notice.tsx`(서버).
- `app/admin/quotes/[publicId]/payment-method-form.tsx` 가 공용 배열을 쓴다.
- `src/lib/supplier.ts` 가 `QUOTE_SUPPLIER_CONTACT` 를 읽는다.

## 남은 일

- ~~`Payment` 테이블을 연동 전까지 비워 둔다.~~ **지웠다. (ADR-0036)** 칸 이름이
  아임포트 규격이라 결제선생 응답을 담을 수 없었고, 0행이라 지워서 잃을 것이 없었다.
  연동을 시작할 때 테이블 설계부터 ADR 로 한다.
- 결제선생 가맹점 코드·시크릿을 받으면 **서버에서 검증하는** 카드 결제를 구현한다.
- `QUOTE_SUPPLIER_CONTACT` 실제 값 확인.
