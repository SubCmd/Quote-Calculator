"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { formatKRW } from "@/lib/money";
import type { CatalogProduct } from "@/services/catalog/catalog";
import type { CalculationSuccess, Violation } from "@/services/pricing/types";
import type { TaxBreakdown } from "@/services/pricing/tax";

type EstimateResponse = CalculationSuccess & { tax: TaxBreakdown };
type CatalogGroup = CatalogProduct["groups"][number];

const DEBOUNCE_MS = 300;

function hasSelection(group: CatalogGroup, optionIds: string[]): boolean {
  return group.options.some((o) => optionIds.includes(o.id));
}

/**
 * 선행 그룹이 비어 버린 그룹의 선택을 지운다. (ADR-0010)
 * A→B→C 처럼 이어진 경우를 위해 더 지울 것이 없을 때까지 반복한다.
 */
function pruneUnmetGroups(
  groups: CatalogGroup[],
  optionIds: string[],
): string[] {
  let current = optionIds;

  for (;;) {
    const kept = groups.filter((g) => {
      if (g.dependsOnGroupId === null) return true;
      const prerequisite = groups.find((p) => p.id === g.dependsOnGroupId);
      return prerequisite !== undefined && hasSelection(prerequisite, current);
    });
    const allowed = new Set(kept.flatMap((g) => g.options.map((o) => o.id)));
    const next = current.filter((id) => allowed.has(id));

    if (next.length === current.length) return next;
    current = next;
  }
}

/**
 * 견적 요청. 금액은 보내지 않는다. 서버가 같은 선택으로 다시 계산한다. (ADR-0003)
 * 받는 개인정보는 연락 수단뿐이다. (ADR-0013)
 */
function RequestForm({
  productId,
  optionIds,
  ready,
}: {
  productId: string;
  optionIds: string[];
  ready: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const response = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        optionIds,
        customer: { name, phone, email },
      }),
    });
    const body = await response.json();

    if (body.ok !== true) {
      setError(body.error ?? "견적을 저장하지 못했습니다. 다시 시도해 주세요.");
      setSaving(false);
      return;
    }

    // 이동이 끝날 때까지 버튼을 잠근 채로 둔다. 두 번 누르면 견적이 두 건 생긴다.
    router.push(`/q/${body.publicId}`);
  }

  return (
    <form className="request" onSubmit={submit}>
      <h3>견적 요청</h3>
      <p className="hint">
        연락받을 정보만 남겨 주세요. 저장 후 견적 주소를 보여드립니다.
      </p>

      <label htmlFor="customer-name">
        이름<span className="required-mark">*</span>
      </label>
      <input
        id="customer-name"
        name="name"
        autoComplete="name"
        required
        maxLength={50}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />

      <label htmlFor="customer-phone">
        휴대폰<span className="required-mark">*</span>
      </label>
      <input
        id="customer-phone"
        name="phone"
        type="tel"
        autoComplete="tel"
        required
        placeholder="010-1234-5678"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
      />

      <label htmlFor="customer-email">이메일 (선택)</label>
      <input
        id="customer-email"
        name="email"
        type="email"
        autoComplete="email"
        maxLength={100}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      {error && <p className="form-error">{error}</p>}

      <button type="submit" className="primary" disabled={!ready || saving}>
        {saving ? "저장 중…" : "이 금액으로 견적 요청"}
      </button>
      {!ready && (
        <p className="hint">항목을 선택하면 견적을 요청할 수 있습니다.</p>
      )}
    </form>
  );
}

export function QuoteForm({ catalog }: { catalog: CatalogProduct[] }) {
  const [productId, setProductId] = useState(catalog[0]!.id);
  const [optionIds, setOptionIds] = useState<string[]>([]);

  const [result, setResult] = useState<EstimateResponse | null>(null);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [calculating, setCalculating] = useState(false);

  const product = catalog.find((p) => p.id === productId)!;
  const latestRequest = useRef(0);

  function selectProduct(nextId: string) {
    setProductId(nextId);
    setOptionIds([]);
  }

  // 이미 선택된 옵션을 다시 누르면 해제한다. 라디오는 기본 동작으로 해제가 안 되므로
  // change 가 아니라 click 을 받는다. (change 는 이미 선택된 항목에서 발생하지 않는다)
  function toggleOption(group: CatalogGroup, optionId: string) {
    setOptionIds((prev) => {
      const groupOptionIds = group.options.map((o) => o.id);
      const others = prev.filter((id) => !groupOptionIds.includes(id));
      const sameGroup = prev.filter((id) => groupOptionIds.includes(id));
      const next = prev.includes(optionId)
        ? [...others, ...sameGroup.filter((id) => id !== optionId)]
        : group.singleSelect
          ? [...others, optionId]
          : [...others, ...sameGroup, optionId];
      return pruneUnmetGroups(product.groups, next);
    });
  }

  // 전체 선택은 그룹 옵션을 한 번에 켜는 보조 입력이다. 자체 상태를 두지 않는다.
  // 할인이 걸리는지는 서버 응답으로만 안다.
  function toggleAll(group: CatalogGroup, nextChecked: boolean) {
    setOptionIds((prev) => {
      const groupOptionIds = group.options.map((o) => o.id);
      const others = prev.filter((id) => !groupOptionIds.includes(id));
      const next = nextChecked ? [...others, ...groupOptionIds] : others;
      return pruneUnmetGroups(product.groups, next);
    });
  }

  useEffect(() => {
    const controller = new AbortController();
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;
    setCalculating(true);

    const timer = setTimeout(() => {
      fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, optionIds }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const body = await response.json();
          // 응답 도착 순서를 신뢰하지 않는다. 마지막 요청의 응답만 반영한다.
          if (latestRequest.current !== requestId) return;

          if (body.ok === true) {
            setResult(body as EstimateResponse);
            setViolations([]);
          } else {
            setResult(null);
            setViolations(
              body.violations ?? [
                { code: "UNKNOWN_OPTION", message: body.error },
              ],
            );
          }
          setCalculating(false);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setCalculating(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [productId, optionIds]);

  const groupViolation = (groupId: string) =>
    violations.find((v) => v.groupId === groupId);
  const generalViolations = violations.filter((v) => v.groupId === undefined);

  return (
    <>
      <div className="tabs" role="tablist" aria-label="상품">
        {catalog.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            id={`tab-${p.id}`}
            aria-selected={p.id === productId}
            aria-controls="product-panel"
            className={p.id === productId ? "tab selected" : "tab"}
            onClick={() => selectProduct(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="layout">
        <div
          id="product-panel"
          role="tabpanel"
          aria-labelledby={`tab-${productId}`}
        >
          {product.groups.map((group, index) => {
            const violation = groupViolation(group.id);
            const allSelected =
              group.options.length > 0 &&
              group.options.every((o) => optionIds.includes(o.id));
            const prerequisite = product.groups.find(
              (g) => g.id === group.dependsOnGroupId,
            );
            const locked =
              prerequisite !== undefined &&
              !hasSelection(prerequisite, optionIds);
            return (
              <fieldset
                key={group.id}
                disabled={locked}
                className={locked ? "locked" : undefined}
              >
                <legend>
                  <span className="step" aria-hidden="true">
                    {index + 1}
                  </span>
                  {group.name}
                  {group.required && <span className="required-mark">*</span>}
                </legend>
                {locked && (
                  <p className="lock-hint">
                    <span aria-hidden="true">🔒</span>
                    먼저 &apos;{prerequisite.name}&apos; 항목을 선택해 주세요.
                  </p>
                )}
                {group.options.map((option) => (
                  <div className="option-row" key={option.id}>
                    <input
                      type={group.singleSelect ? "radio" : "checkbox"}
                      id={`option-${option.id}`}
                      name={`group-${group.id}`}
                      checked={optionIds.includes(option.id)}
                      readOnly
                      onClick={() => toggleOption(group, option.id)}
                    />
                    <label htmlFor={`option-${option.id}`}>{option.name}</label>
                  </div>
                ))}
                {!group.singleSelect && group.options.length > 1 && (
                  <div className="option-row select-all">
                    <input
                      type="checkbox"
                      id={`all-${group.id}`}
                      checked={allSelected}
                      readOnly
                      onClick={() => toggleAll(group, !allSelected)}
                    />
                    <label htmlFor={`all-${group.id}`}>전체 선택</label>
                  </div>
                )}
                {violation && (
                  <p className="group-error">{violation.message}</p>
                )}
              </fieldset>
            );
          })}
        </div>

        <aside className="summary">
          <h2>견적 요약</h2>

          {/* 입력 필드는 이 바깥에 둔다. 라이브 영역 안에 있으면 타이핑까지 읽어 준다. */}
          <div aria-live="polite">
            {calculating && (
              <>
                <p className="calculating">
                  <span className="spinner" aria-hidden="true" />
                  금액을 계산하고 있습니다…
                </p>
                <div className="skeleton" />
                <div className="skeleton" />
                <div className="skeleton wide" />
              </>
            )}

            {/* 그룹에 속한 위반은 해당 그룹 옆에만 표시한다. 여기서 또 보여주면 중복이다. */}
            {!calculating && generalViolations.length > 0 && (
              <ul className="violations">
                {generalViolations.map((v, i) => (
                  <li key={`${v.code}-${i}`}>{v.message}</li>
                ))}
              </ul>
            )}

            {!calculating &&
              generalViolations.length === 0 &&
              violations.length > 0 && (
                <p className="empty-note">선택을 완료하면 금액이 표시됩니다.</p>
              )}

            {!calculating && result && (
              <>
                <table>
                  <tbody>
                    {result.items[0]!.appliedOptions.map((option) => (
                      <tr key={option.optionId}>
                        <td className="label">{option.name}</td>
                        <td>{formatKRW(option.amount)}</td>
                      </tr>
                    ))}
                    <tr className="subtotal">
                      <td className="label">소계 (10원 단위 버림)</td>
                      <td>{formatKRW(result.subtotal)}</td>
                    </tr>
                    {result.appliedDiscount && (
                      <tr className="discount">
                        <td className="label">{result.appliedDiscount.name}</td>
                        <td>-{formatKRW(result.discountAmount)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <dl className="total-box">
                  <dt>
                    총액
                    <small>부가세 포함</small>
                  </dt>
                  <dd>{formatKRW(result.totalAmount)}</dd>
                </dl>
                {result.totalAmount > 0 && (
                  <p className="tax-note">
                    공급가액 {formatKRW(result.tax.supplyAmount)} · 부가세{" "}
                    {formatKRW(result.tax.vatAmount)}
                  </p>
                )}
                {result.items[0]!.appliedOptions.length === 0 && (
                  <p className="empty-note">
                    옵션을 선택하면 금액이 올라갑니다.
                  </p>
                )}
                {result.discountCandidates.length > 1 && (
                  <p className="tax-note">
                    할인 후보 {result.discountCandidates.length}건 중 할인액이
                    가장 큰 1건을 적용했습니다.
                  </p>
                )}
              </>
            )}
          </div>

          <RequestForm
            productId={productId}
            optionIds={optionIds}
            ready={!calculating && result !== null && result.totalAmount > 0}
          />
        </aside>
      </div>

      {/* 좁은 화면에서는 요약이 화면 밖으로 밀린다. 총액만 아래에 띄워 둔다.
          요약 패널이 이미 aria-live 로 읽어 주므로 여기서는 숨긴다. */}
      <div className="mobile-total" aria-hidden="true">
        <span className="label">총액 (부가세 포함)</span>
        <span className="value">
          {calculating
            ? "계산 중…"
            : result
              ? formatKRW(result.totalAmount)
              : "—"}
        </span>
      </div>
    </>
  );
}
