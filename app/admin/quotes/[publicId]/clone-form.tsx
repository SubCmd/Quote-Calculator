"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Violation {
  message: string;
}

/**
 * 견적 복제. 금액은 서버가 지금 가격 규칙으로 다시 계산한다. (ADR-0014)
 * 원본과 같은 금액이라고 안내하지 않는다. 복제 후 새 견적 화면으로 보낸다.
 */
export function CloneForm({ publicId }: { publicId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<Violation[]>([]);

  async function clone() {
    const ok = window.confirm(
      "선택과 연락처를 가져와 새 견적을 만듭니다.\n" +
        "금액은 지금 가격 규칙으로 다시 계산되므로 원본과 다를 수 있습니다.\n" +
        "원본은 그대로 남습니다. 계속할까요?",
    );
    if (!ok) return;

    setPending(true);
    setError(null);
    setViolations([]);

    const response = await fetch(`/api/admin/quotes/${publicId}/clone`, {
      method: "POST",
    });
    const body = await response.json();

    if (body.ok !== true) {
      setError(body.error ?? "복제하지 못했습니다.");
      setViolations(body.violations ?? []);
      setPending(false);
      return;
    }

    router.push(`/admin/quotes/${body.publicId}`);
  }

  return (
    <div className="status-actions">
      <button
        type="button"
        className="ghost"
        disabled={pending}
        onClick={clone}
      >
        {pending ? "복제 중…" : "복제해서 새 견적 만들기"}
      </button>
      {error && <p className="form-error">{error}</p>}
      {violations.map((violation) => (
        <p key={violation.message} className="form-error">
          {violation.message}
        </p>
      ))}
    </div>
  );
}
