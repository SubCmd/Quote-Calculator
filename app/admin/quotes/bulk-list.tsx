"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

/**
 * 목록 한 줄. **금액·일시는 서버가 이미 문자열로 만들어 넘긴다.**
 * 클라이언트에서 `toLocaleString` 을 부르면 서버와 다른 결과가 나와 수화가 어긋난다.
 */
export interface BulkListRow {
  publicId: string;
  whenText: string;
  productName: string;
  maskedName: string;
  maskedPhone: string;
  totalText: string;
  paymentText: string;
  statusText: string;
  /** 취소·만료처럼 흐리게 그릴 상태인가. 서버가 정한다. */
  dimmed: boolean;
  /** 행을 지울 수 있는 건인가. 저장된 상태로 판정한 값이다. (ADR-0041) */
  deletable: boolean;
}

type Action = "hide" | "delete";

function confirmText(action: Action, count: number): string {
  if (action === "delete")
    return [
      `선택한 ${count}건을 지웁니다.`,
      "",
      "이 작업은 되돌릴 수 없습니다. 견적 데이터가 영구히 삭제됩니다.",
      "지웠다는 기록은 변경 이력에 남습니다.",
      "",
      "계속할까요?",
    ].join("\n");

  return [
    `선택한 ${count}건을 목록에서 숨깁니다.`,
    "",
    "데이터는 지워지지 않고 고객 링크만 닫힙니다.",
    "'숨긴 견적' 목록에서 상세를 열어 되돌릴 수 있습니다.",
    "",
    "계속할까요?",
  ].join("\n");
}

/**
 * 견적 목록. 줄마다 체크박스를 두고 고른 건을 하단 버튼으로 처리한다. (ADR-0041)
 *
 * **전체 선택 체크박스를 두지 않는다.** 입력 하나가 20건을 고르게 만들면, 지울 생각이
 * 없던 건이 선택에 들어온 것을 읽지 못한다. (ADR-0026 과 같은 선)
 *
 * 삭제 버튼 비활성은 **보조**다. 확정 건 판정은 서버가 다시 한다. 목록이 낡은 사이에
 * 상태가 바뀌었을 수 있다.
 */
export function BulkQuoteList({
  rows,
  hiddenView,
}: {
  rows: BulkListRow[];
  /** 숨긴 견적 목록을 보고 있는가. 이미 숨긴 건을 또 숨기는 버튼은 두지 않는다. */
  hiddenView: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const toggle = (publicId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(publicId)) next.delete(publicId);
      else next.add(publicId);
      return next;
    });
    setError(null);
    setDone(null);
  };

  const picked = rows.filter((row) => selected.has(row.publicId));
  const blocked = picked.filter((row) => !row.deletable);

  async function run(action: Action) {
    const publicIds = picked.map((row) => row.publicId);
    if (publicIds.length === 0) return;
    if (!window.confirm(confirmText(action, publicIds.length))) return;

    setPending(action);
    setError(null);
    setDone(null);

    try {
      const response = await fetch("/api/admin/quotes/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, publicIds }),
      });
      const body = await response.json();

      if (body.ok !== true) {
        setError(body.error ?? "처리하지 못했습니다.");
        return;
      }

      // 처리한 건은 목록에서 빠진다. 선택을 비워 두지 않으면 없는 행을 가리킨다.
      setSelected(new Set());
      setDone(
        `${body.count}건을 ${action === "delete" ? "삭제" : "숨김"} 처리했습니다.`,
      );
      router.refresh();
    } catch {
      setError("네트워크 연결을 확인해 주세요.");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <table className="quote-list">
        <thead>
          <tr>
            <th className="pick">
              <span className="sr-only">선택</span>
            </th>
            <th>요청 일시</th>
            <th>상품</th>
            <th>고객</th>
            <th>연락처</th>
            <th>총액</th>
            <th>결제 방식</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.publicId}
              className={selected.has(row.publicId) ? "picked" : undefined}
            >
              <td className="pick">
                <input
                  type="checkbox"
                  id={`pick-${row.publicId}`}
                  checked={selected.has(row.publicId)}
                  disabled={pending !== null}
                  onChange={() => toggle(row.publicId)}
                />
                <label htmlFor={`pick-${row.publicId}`} className="sr-only">
                  {row.whenText} {row.maskedName} 선택
                </label>
              </td>
              <td className="when">
                <Link href={`/admin/quotes/${row.publicId}`}>
                  {row.whenText}
                </Link>
              </td>
              <td>{row.productName}</td>
              <td>{row.maskedName}</td>
              <td className="num">{row.maskedPhone}</td>
              <td className="num">{row.totalText}</td>
              <td>{row.paymentText}</td>
              <td>
                <span
                  className={
                    row.dimmed ? "status-badge expired" : "status-badge"
                  }
                >
                  {row.statusText}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="bulk-bar">
        <p className="bulk-count">
          {picked.length === 0
            ? "정리할 견적을 골라 주세요."
            : `${picked.length}건 선택`}
        </p>

        <div className="bulk-actions">
          {!hiddenView && (
            <button
              type="button"
              className="ghost"
              disabled={picked.length === 0 || pending !== null}
              onClick={() => run("hide")}
            >
              {pending === "hide" ? "숨기는 중…" : "숨기기"}
            </button>
          )}
          <button
            type="button"
            className="ghost danger"
            disabled={
              picked.length === 0 || blocked.length > 0 || pending !== null
            }
            onClick={() => run("delete")}
          >
            {pending === "delete" ? "지우는 중…" : "삭제"}
          </button>
        </div>

        {blocked.length > 0 && (
          <p className="hint">
            선택에 확정된 견적 {blocked.length}건이 있습니다. 보존 의무가 있어
            지울 수 없고 숨기기만 가능합니다.
          </p>
        )}
        {error && <p className="form-error">{error}</p>}
        {done && (
          <p className="hint" role="status" aria-live="polite">
            {done}
          </p>
        )}
      </div>
    </>
  );
}
