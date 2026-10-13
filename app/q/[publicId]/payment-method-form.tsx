"use client";

import type { PaymentMethod } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PAYMENT_METHOD_CHOICES } from "@/lib/payment-method";

interface PaymentMethodFormProps {
  publicId: string;
  selectedMethod: PaymentMethod | null;
}

/**
 * 상태 코드만 보고 고르는 고정 문구. 응답 본문을 읽지 않는다. (ADR-0021)
 * `/q/[publicId]` 는 인증 없는 공개 경로라서 서버가 만든 문장을 그대로 띄우면
 * 내부 사정이 새어 나간다.
 */
function messageFor(status: number): string {
  if (status === 404) return "견적을 찾을 수 없습니다.";
  if (status === 409)
    return "이미 처리가 진행된 견적입니다. 새로 고친 뒤 확인해 주세요.";
  if (status === 422)
    return "지금은 결제 방식을 선택할 수 없는 견적입니다. 담당자에게 문의해 주세요.";
  return "결제 방식 선택에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export function PaymentMethodForm({
  publicId,
  selectedMethod,
}: PaymentMethodFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState<PaymentMethod | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (method: PaymentMethod) => {
    setPending(method);
    setError(null);

    try {
      const response = await fetch(`/api/quote/${publicId}/payment-method`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: method }),
      });

      if (!response.ok) {
        setError(messageFor(response.status));
        return;
      }

      router.refresh();
    } catch {
      setError("네트워크 연결을 확인해 주세요.");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="method-choices">
      {PAYMENT_METHOD_CHOICES.map((choice) => {
        const isSelected = selectedMethod === choice.value;

        return (
          <button
            key={choice.value}
            type="button"
            className={isSelected ? "primary selected" : "ghost"}
            aria-pressed={isSelected}
            disabled={pending !== null}
            onClick={() => handleSelect(choice.value)}
          >
            <span className="method-label">
              {pending === choice.value ? "선택 중…" : choice.label}
            </span>
            <span className="method-desc">{choice.description}</span>
          </button>
        );
      })}

      <p className="form-error" role="status" aria-live="polite">
        {error}
      </p>
    </div>
  );
}
