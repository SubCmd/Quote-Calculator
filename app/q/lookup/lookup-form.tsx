"use client";

import Link from "next/link";
import { useState } from "react";
import { formatKRW } from "@/lib/money";

/**
 * 이름과 휴대전화번호로 자기 플랜을 찾는 입력 위젯. (ADR-0045)
 *
 * 결과는 화면 상태로만 들고 있다. URL 에 담지 않는다. 공유할 수 있는 주소는
 * 개별 플랜의 `/q/{publicId}` 하나다.
 */

/** 서버가 준 모양 그대로다. 상태 문구도 서버 값이고 화면이 코드로 분기하지 않는다. */
interface LookupPlanView {
  publicId: string;
  productNames: string[];
  totalAmount: number;
  statusText: string;
  /** JSON 을 거치며 ISO 문자열이 된다. */
  requestedAt: string;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "long",
  });
}

/** 찾지 못했을 때의 문구는 **하나다.** 어느 칸이 틀렸는지 나눠 적지 않는다. (ADR-0045 §5) */
const NOT_FOUND = "입력하신 정보와 일치하는 컨쇼 플랜을 찾지 못했습니다.";

type Outcome =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found"; plans: LookupPlanView[] }
  | { kind: "message"; text: string };

export function LookupForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setOutcome({ kind: "loading" });

    let response: Response;
    try {
      response = await fetch("/api/q/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone }),
      });
    } catch {
      setOutcome({
        kind: "message",
        text: "조회에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      });
      return;
    }

    // 500 의 본문은 읽지 않는다. 상태 코드만 보고 고정 문구를 띄운다. (ADR-0021)
    if (response.status >= 500) {
      setOutcome({
        kind: "message",
        text: "조회에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      });
      return;
    }

    const body = await response.json();

    if (!response.ok) {
      setOutcome({
        kind: "message",
        text: body.error ?? "입력을 확인해 주세요.",
      });
      return;
    }

    if (body.plans.length === 0) {
      setOutcome({ kind: "message", text: NOT_FOUND });
      return;
    }

    setOutcome({ kind: "found", plans: body.plans });
  }

  return (
    <>
      <form className="lookup-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="lookup-name">이름</label>
          <input
            id="lookup-name"
            name="name"
            autoComplete="name"
            maxLength={50}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="lookup-phone">휴대전화번호</label>
          <input
            id="lookup-phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="010-1234-5678"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={outcome.kind === "loading"}>
          {outcome.kind === "loading" ? "찾는 중…" : "내 플랜 찾기"}
        </button>
      </form>

      <div aria-live="polite">
        {outcome.kind === "message" && (
          <p className="lookup-message">{outcome.text}</p>
        )}

        {outcome.kind === "found" && (
          <ul className="lookup-results">
            {outcome.plans.map((plan) => (
              <li key={plan.publicId}>
                <Link href={`/q/${plan.publicId}`}>
                  <span className="status-badge">{plan.statusText}</span>
                  <strong>{plan.productNames.join(", ")}</strong>
                  <span className="num">
                    {formatKRW(plan.totalAmount)} <small>현금가</small>
                  </span>
                  <span className="hint">
                    {formatDate(plan.requestedAt)} 요청 · 플랜 번호{" "}
                    {plan.publicId}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
