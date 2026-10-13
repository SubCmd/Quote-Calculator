"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface NextStatus {
  value: string;
  label: string;
}

/**
 * 상태 변경. 어떤 전이가 가능한지는 서버가 내려준 목록만 믿는다.
 *
 * 확인 단계를 두는 이유가 "되돌릴 수 없어서" 는 아니다. 확정·취소는 되돌릴 수 있다. (ADR-0034)
 * 목록에서 옆 줄을 눌러 엉뚱한 견적을 바꾸는 일을 막는 자리다.
 */
export function StatusForm({
  publicId,
  currentLabel,
  nextStatuses,
  leavingConfirmed,
}: {
  publicId: string;
  currentLabel: string;
  nextStatuses: NextStatus[];
  /** 확정을 떠나는 전이면 `confirmedAt` 이 비워진다. 판단은 서버가 한다. */
  leavingConfirmed: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function change(next: NextStatus) {
    const ok = window.confirm(
      `상태를 '${currentLabel}' 에서 '${next.label}' 로 바꿉니다.\n` +
        (leavingConfirmed ? "확정 시각이 지워집니다.\n" : "") +
        `변경 기록이 남습니다. 계속할까요?`,
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
