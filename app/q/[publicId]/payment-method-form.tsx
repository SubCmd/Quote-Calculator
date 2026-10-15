"use client";

import type { PaymentMethod } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatKRW } from "@/lib/money";
import { PAYMENT_METHOD_CHOICES } from "@/lib/payment-method";

interface PaymentMethodFormProps {
  publicId: string;
  selectedMethod: PaymentMethod | null;
  /** 현금가. 저장된 총액 그대로다. */
  cashAmount: number;
  /** 현금가 + 부가세 10%. 서버가 구해서 넘긴다. 여기서 곱하지 않는다. (ADR-0039) */
  cardAmount: number;
}

/**
 * 상태 코드만 보고 고르는 고정 문구. 응답 본문을 읽지 않는다. (ADR-0021)
 * `/q/[publicId]` 는 인증 없는 공개 경로라서 서버가 만든 문장을 그대로 띄우면
 * 내부 사정이 새어 나간다.
 */
function messageFor(status: number): string {
  if (status === 404) return "플랜을 찾을 수 없습니다.";
  if (status === 409)
    return "이미 처리가 진행된 플랜입니다. 새로 고친 뒤 확인해 주세요.";
  if (status === 422)
    return "지금은 결제 방식을 선택할 수 없는 플랜입니다. 담당자에게 문의해 주세요.";
  return "결제 방식 선택에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export function PaymentMethodForm({
  publicId,
  selectedMethod,
  cashAmount,
  cardAmount,
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
            {/* 방식마다 지불 금액이 다르므로 고르는 순간에 그 숫자가 보여야 한다. (ADR-0039) */}
            <span className="method-amount">
              {formatKRW(choice.vatAdded ? cardAmount : cashAmount)}
              {choice.vatAdded && <small>부가세 10% 포함</small>}
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
