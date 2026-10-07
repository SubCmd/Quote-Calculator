"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface NextStatus {
  value: string;
  label: string;
}

/**
 * 상태 변경. 되돌릴 수 없는 작업이라 확인 단계를 둔다. (`.claude/rules/admin.md`)
 * 어떤 전이가 가능한지는 서버가 내려준 목록만 믿는다.
 */
export function StatusForm({
  publicId,
  currentLabel,
  nextStatuses,
}: {
  publicId: string;
  currentLabel: string;
  nextStatuses: NextStatus[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function change(next: NextStatus) {
    const ok = window.confirm(
      `상태를 '${currentLabel}' 에서 '${next.label}' 로 바꿉니다.\n` +
        `되돌릴 수 없습니다. 계속할까요?`,
    );
    if (!ok) return;

    setPending(next.value);
    setError(null);

    const response = await fetch(`/api/admin/quotes/${publicId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next.value }),
    });
    const body = await response.json();

    if (body.ok !== true) {
      setError(body.error ?? "상태를 바꾸지 못했습니다.");
      setPending(null);
      return;
    }

    router.refresh();
    setPending(null);
  }

  if (nextStatuses.length === 0) {
    return (
      <p className="hint">
        &apos;{currentLabel}&apos; 은 종착 상태입니다. 금액을 바꿔야 하면 복제해
        새 견적을 만드세요.
      </p>
    );
  }

  return (
    <div className="status-actions">
      {nextStatuses.map((next) => (
        <button
          key={next.value}
          type="button"
          className="primary"
          disabled={pending !== null}
          onClick={() => change(next)}
        >
          {pending === next.value ? "변경 중…" : `${next.label}(으)로 변경`}
        </button>
      ))}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
