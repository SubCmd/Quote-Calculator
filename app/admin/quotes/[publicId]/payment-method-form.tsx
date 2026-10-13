"use client";

import type { PaymentMethod } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PAYMENT_METHOD_CHOICES } from "@/lib/payment-method";

interface PaymentMethodFormProps {
  publicId: string;
  selectedMethod: PaymentMethod | null;
  isDisabled: boolean;
}

export function PaymentMethodForm({
  publicId,
  selectedMethod,
  isDisabled,
}: PaymentMethodFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState<PaymentMethod | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (method: PaymentMethod) => {
    setPending(method);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/quotes/${publicId}/payment-method`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentMethod: method }),
        },
      );

      if (!response.ok) {
        setError("결제 방식 선택에 실패했습니다. 상태를 확인해 주세요.");
        return;
      }

      router.refresh();
    } catch {
      setError("네트워크 연결을 확인해 주세요.");
    } finally {
      setPending(null);
    }
  };

  if (isDisabled) {
    return (
      <p className="hint">
        요청 상태인 견적에서만 결제 방식을 선택할 수 있습니다.
      </p>
    );
  }

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
