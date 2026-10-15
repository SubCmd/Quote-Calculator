"use client";

import Link from "next/link";

// 관리자 경로의 렌더링 예외. 담당자는 고칠 수 있으므로 고객과 다른 문구를 쓴다. (ADR-0021)
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="notice-page">
      <h1>화면을 그릴 수 없습니다</h1>
      <p className="subtitle">연결 또는 가격 데이터를 확인해 주세요.</p>

      <div className="card notice-card">
        <p>확인할 곳은 두 군데입니다.</p>
        <ul className="notice-list">
          <li>데이터베이스 연결이 끊겼는지</li>
          <li>
            할인 조건의 옵션 코드가 현재 가격 규칙 버전에 실제로 있는지 (없으면
            계산이 거부된다)
          </li>
        </ul>
        <p className="notice-warn">
          다시 시도해도 같은 화면이면 새로고침으로는 풀리지 않습니다. 서버
          로그에서 아래 번호로 원인을 확인해 주세요.
        </p>
        <div className="notice-actions">
          <button type="button" className="primary" onClick={reset}>
            다시 시도
          </button>
          <Link className="ghost" href="/admin">
            가격 규칙
          </Link>
        </div>
        {error.digest ? (
          <p className="notice-digest">
            서버 로그의 같은 예외를 가리키는 번호입니다.
            <code>{error.digest}</code>
          </p>
        ) : null}
      </div>
    </main>
  );
}
