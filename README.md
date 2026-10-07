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

취급 상품은 입시·교육 컨설팅 4종(1회성 / 과정 / 고2 올스토리 / 고3 올스토리)으로 확정됐다.
**금액은 대부분 임시값이다.** 확정된 값은 카톡 소통 300,000원, 이메일 소통 100,000원 둘뿐이다.
나머지는 `prisma/seed.ts`에 넣어 둔 자리값이고, DB 값이므로 코드 수정 없이 교체할 수 있다.

| 영역 | 상태 |
| ---- | ---- |
| Pricing Service (순수 계산) | 구현 + 경계값 테스트 71개 통과 (계산 · 상태 전이 · 마스킹) |
| Repository / API Route / 견적 화면 | 구현. DB 연결·마이그레이션·seed·브라우저 동작까지 확인 |
| 가격 관리 (`/admin`) | 구현. 로그인 → 미리보기 → 변경 요약 확인 → 새 버전 저장 → 변경 이력까지 확인 |
| 견적 저장·조회 | 구현. 요청 폼 → `POST /api/quotes`(서버 재계산) → `/q/[publicId]` 까지 확인 |
| 견적 관리 (`/admin/quotes`) | 구현. 목록(마스킹·필터·페이지네이션) → 상세(연락처 전체 + 열람 로그) → 상태 변경까지 확인 |
| 견적 복제, PDF 출력, 개인정보 파기 배치 | 미착수 |

관리자 인증은 공유 비밀번호 하나다. **운영용이 아니다** (ADR-0011).

남은 미확정 항목은 `docs/requirements.md` 8절에 있다. 실제 금액표(Q-9)가 가장 크다.

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
