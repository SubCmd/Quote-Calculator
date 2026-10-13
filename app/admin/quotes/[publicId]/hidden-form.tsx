"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * 견적 숨기기·되돌리기. 행을 지우지 않는다. (ADR-0035)
 * 숨기면 고객 링크도 닫히고, 되돌리면 같은 주소가 다시 열린다.
 */
export function HiddenForm({
  publicId,
  hidden,
}: {
  publicId: string;
  hidden: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !hidden;
    const ok = window.confirm(
      next
        ? "이 견적을 목록에서 숨깁니다.\n고객이 보고 있는 링크도 함께 닫힙니다.\n'숨긴 견적' 목록에서 되돌릴 수 있습니다. 계속할까요?"
        : "이 견적을 목록으로 되돌립니다.\n고객 링크가 다시 열립니다. 계속할까요?",
    );
    if (!ok) return;

    setPending(true);
    setError(null);

    const response = await fetch(`/api/admin/quotes/${publicId}/hidden`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden: next }),
    });
    const body = await response.json();

    if (body.ok !== true) {
      setError(body.error ?? "처리하지 못했습니다.");
      setPending(false);
      return;
    }

    router.refresh();
    setPending(false);
  }

  return (
    <div className="status-actions">
      <button
        type="button"
        className="ghost"
        disabled={pending}
        onClick={toggle}
      >
        {pending ? "처리 중…" : hidden ? "목록으로 되돌리기" : "목록에서 숨기기"}
      </button>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
