"use client";

import Link from "next/link";

// 고객 경로의 렌더링 예외. error.message 는 쓰지 않는다. (ADR-0021)
export default function CustomerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="notice-page">
      <h1>금액을 보여드릴 수 없습니다</h1>
      <p className="subtitle">
        일시적인 문제로 플랜 금액을 불러오지 못했습니다. 잘못된 금액을
        보여드리지 않기 위해 화면을 멈췄습니다.
      </p>

      <div className="card notice-card">
        <p>잠시 후 다시 시도해 주세요.</p>
        <div className="notice-actions">
          <button type="button" className="primary" onClick={reset}>
            다시 시도
          </button>
          <Link className="ghost" href="/">
            처음으로
          </Link>
        </div>
        {error.digest ? (
          <p className="notice-digest">
            문의하실 때 이 번호를 알려주시면 더 빠르게 확인할 수 있습니다.
            <code>{error.digest}</code>
          </p>
        ) : null}
      </div>
    </main>
  );
}
