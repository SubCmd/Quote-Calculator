# quote_calculator

옵션 선택을 기반으로 견적 금액을 계산하고, 관리자가 가격 규칙을 직접 관리하는 웹 애플리케이션.

## 각 파일들의 역할

| 파일 | 역할 |
| ---- | ---- |
| `CLAUDE.md` | AI가 항상 지켜야 할 전체 프로젝트 규칙 |
| `.claude/rules/*.md` | 특정 영역의 상세 구현 규칙 (항상 로드됨) |
| `.claude/skills/*/SKILL.md` | 특정 작업을 수행하는 절차 |
| `docs/requirements.md` | 무엇을 만들어야 하는가 |
| `docs/pricing-rules.md` | 가격 계산의 실제 업무 규칙 |
| `docs/architecture.md` | 시스템을 어떻게 구성했는가 |
| `docs/decisions/*.md` | 왜 이렇게 설계했는가 (ADR) |

### `.claude/rules/`

| 파일 | 내용 |
| ---- | ---- |
| `architecture.md` | 레이어와 의존 방향 |
| `pricing.md` | 계산 로직 작성 규약 |
| `database.md` | Prisma 스키마·쿼리·마이그레이션 |
| `ui.md` | 화면 작성 규칙 |
| `admin.md` | 관리자 기능·권한·감사 로그 |
| `testing.md` | 테스트 작성 규칙 |

## 어떤 구조로 이뤄지는지?

```
                    CLAUDE.md (헌법)
                       │
             ┌─────────┴─────────┐
             ↓                   ↓
       .claude/rules/          docs/
             │                   │
          구현 규칙           프로젝트 지식
        (어떻게 쓸까)         (무엇을 · 왜)
             │                   │
             └─────────┬─────────┘
                       ↓
                  Claude Code
                       ↓
                     구현
                       ↓
                     Tests
```

규칙이 충돌하면 `CLAUDE.md` → `.claude/rules/` → `docs/` 순으로 우선한다.

## 현재 상태

계산 정책(부가세, 할인 중복, 반올림, 수량 개념 제거)은 확정되어 ADR로 기록했다.
`docs/requirements.md` 7절 참조.

취급 상품은 입시·교육 컨설팅 5종(1회성 / 과정 / 고2 올스토리 / 고3 올스토리 / 정시 상담)이다.
**금액은 전부 확정값이다.** 1회성(ADR-0026) · 과정(ADR-0027) · 고2 올스토리(ADR-0028) ·
고3 올스토리(ADR-0029, ADR-0030) · 정시 상담(ADR-0048) 순으로 확정됐고 임시값은 남아 있지 않다.
(`docs/requirements.md` Q-9 해소) 금액은 DB 값이므로 이후 변경도 코드 수정 없이 된다.
미등록 상품은 `생기부 첨삭` 하나이고 금액이 정해지면 추가 옵션으로 등록한다.

| 영역 | 상태 |
| ---- | ---- |
| Pricing Service (순수 계산) | 구현 + 단위 테스트 239개 통과 (계산 · 상태 전이 · 검색 기간 · 입금 안내 여부 · 로그인 잠금 · 관리자 입력 검증) |
| Repository / API Route / 견적 화면 | 구현. DB 연결·마이그레이션·seed·브라우저 동작까지 확인 |
| 가격 관리 (`/admin`) | 구현. 로그인 → 미리보기 → 변경 요약 확인 → 새 버전 저장 → 변경 이력까지 확인 |
| 견적 저장·조회 | 구현. 요청 폼 → `POST /api/quotes`(서버 재계산) → `/q/[publicId]` 까지 확인 |
| 견적 관리 (`/admin/quotes`) | 구현. 목록(검색·페이지네이션) → 상세(열람 로그) → 상태 변경 → 복제까지 확인. 연락처는 목록에서도 가리지 않는다 (ADR-0047) |
| 견적서 출력 | 구현. `/q/[publicId]/print` 인쇄 전용 페이지 (ADR-0016) |
| 옵션 비활성화 | 구현. 조건으로 쓰이는 할인도 함께 비활성화 (ADR-0017) |
| 개인정보 수집·이용 동의 | 구현. 고지 → 필수 동의 → 서버 거부 → 동의 시각 저장 (ADR-0018) |
| 입금 계좌 안내 | 구현. 견적 조회 화면·견적서에 표기. 만료·취소 견적에는 안 띄운다 (ADR-0019) |
| 로그인 시도 제한 | 구현. IP별 5회 · 전체 20회(10분 창) → `429`. 마지막 실패 10분 후 해제 (ADR-0020) |
| 예외 화면 | 구현. 고객·관리자·404 세 화면 + 계산 실패 표시. 메시지 대신 `digest` 만 (ADR-0021) |
| 개인정보 파기 배치 | **미착수. 운영 공개 전 필수** |

`npm run build` 통과를 확인했다. 기능 백로그에서 남은 것은 담당자 수동 금액 조정(Q-2)과
이메일 발송(F-5-2)인데, 이메일은 **아직 필요하지 않다고 확인됐다(2026-10-07)**.

## 운영 공개 전에 해야 하는 것

기능이 아니라 **공개 요건**이다. 지금 상태로 도메인만 붙이면 동작은 하지만, 실제 고객의
이름·휴대폰을 받는 순간 아래가 걸린다.

| # | 항목 | 왜 |
| ---- | ---- | ---- |
| 1 | **개인정보 파기 수단** | 보유기간(미확정 1년 / `CONFIRMED` 5년)은 ADR-0013 에 정해 두고 실행 수단이 없다 |
| 2 | **운영 DB 에 상품 5종 반영** | 금액은 전부 확정값이다 (Q-9 해소). 남은 것은 운영 DB 에 넣는 일이고, 상품·단계는 `/admin` 상품 설계에서 만든다 (ADR-0046, ADR-0048) |
| 3 | **강한 `ADMIN_PASSWORD`** | 시도 제한(ADR-0020)은 대입을 느리게 만들 뿐이다. 10분에 5회라도 `1234` 는 언젠가 뚫린다 |

**개인정보 수집·이용 동의**는 ADR-0018 로 해소됐다. 고지 문구의 보유기간은 ADR-0013 의 실제
정책(1년 / 확정 5년)과 같은 값으로 맞췄다. 둘 중 하나만 고치면 고지가 거짓이 되므로 함께 고친다.

**로그인 시도 제한**은 ADR-0020 으로 해소됐다. 다만 `x-forwarded-for` 는 위조될 수 있어서
IP별 한도는 **신뢰할 수 있는 프록시 뒤에 둘 때만** 정밀하게 동작한다. 전체 한도가 그 경우의 안전망이다.

**예외 화면**은 ADR-0021 로 해소됐다. 만들면서 더 나쁜 것을 찾았다. 가격 데이터 오류는 서버 렌더링이
아니라 `POST /api/estimate` 에서 터져서 **조용히 삼켜지고 있었다.** 옵션을 골랐는데 금액도 오류도
안 뜨는 화면은 0원으로 읽힌다. 지금은 사유를 띄우고 요청 버튼을 열지 않는다.
예외 화면은 **운영 빌드로 확인해야 보인다.** 개발 모드에서는 Next.js 오버레이가 먼저 뜬다.

운영 배포는 `prisma migrate deploy` 를 쓴다. `migrate dev` 는 개발 전용이다.
`ADMIN_PASSWORD` / `ADMIN_SESSION_SECRET` / `QUOTE_SUPPLIER_*` 를 운영 값으로 채워야 한다.
`QUOTE_SUPPLIER_BANK_NAME` / `_ACCOUNT_HOLDER` / `_ACCOUNT_NO` 는 세 개가 모두 있어야 계좌가 표기된다.

## 실행

```bash
npm install

# PostgreSQL 준비 (예: Docker)
docker run -d --name quote-calc-db \
  -e POSTGRES_USER=quote -e POSTGRES_PASSWORD=quote -e POSTGRES_DB=quote_calculator \
  -p 5433:5432 postgres:16-alpine

cp .env.example .env        # DATABASE_URL, ADMIN_PASSWORD, ADMIN_SESSION_SECRET 설정
npx prisma migrate dev      # 스키마 반영
npm run db:seed             # 상품 4종 투입 (금액은 대부분 임시값)
npm run dev                 # http://localhost:3000
```

`ADMIN_PASSWORD` / `ADMIN_SESSION_SECRET` 중 하나라도 없으면 `/admin`은 404로 닫힌다.

계산 로직만 확인하려면 DB 없이 `npm test`로 충분하다.
