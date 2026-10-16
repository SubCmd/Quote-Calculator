"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { formatKRW } from "@/lib/money";
import type { CatalogProduct } from "@/services/catalog/catalog";
import type { CalculationSuccess, Violation } from "@/services/pricing/types";

type EstimateResponse = CalculationSuccess;
type CatalogGroup = CatalogProduct["groups"][number];

const DEBOUNCE_MS = 300;

/**
 * 설명 문구. 한 줄은 항상 보이고 긴 설명만 접는다. (ADR-0025)
 * 호버 툴팁을 쓰지 않는 이유는 터치 기기에 hover 상태가 없어서다.
 * `<details>` 는 스크립트 없이 열리고 키보드로 접근된다. 열림 상태를 컴포넌트에 두지 않는다.
 *
 * 관리자가 입력한 평문이다. HTML 로 해석하지 않고 줄바꿈만 CSS 로 살린다.
 */
function Description({
  summary,
  detail,
}: {
  summary: string | null;
  detail: string | null;
}) {
  if (!summary && !detail) return null;
  return (
    <>
      {summary && <p className="description">{summary}</p>}
      {detail && (
        <details className="description-detail">
          <summary>자세히</summary>
          <p>{detail}</p>
        </details>
      )}
    </>
  );
}

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
 * 수집 전에 고지할 내용. 여기 없는 항목을 받으면 안 된다. (ADR-0018)
 * 보유기간은 ADR-0013 의 실제 정책과 같은 값이어야 한다.
 */
const CONSENT_NOTICE: { label: string; value: string }[] = [
  {
    label: "수집·이용 목적",
    value: "플랜 신청자 확인 및 입력한 조건에 따른 컨쇼 플랜 결과 제공",
  },
  {
    label: "수집 항목",
    value: "이름, 휴대전화번호 (필수) / 이메일 (선택)",
  },
  {
    label: "보유·이용 기간",
    value:
      "플랜 생성 후 1년. 플랜이 확정된 경우 확정 후 5년 (전자상거래법상 계약·결제 기록 보존)",
  },
  {
    label: "동의 거부 권리",
    value:
      "동의를 거부할 수 있습니다. 다만 동의하지 않으면 컨쇼 플랜 결과 제공이 제한될 수 있습니다.",
  },
];

/**
 * 취소·환불 규정 요약. 전문은 `/refund` 다. (ADR-0042)
 * 요약과 전문이 어긋나면 안 되므로, 전문을 고칠 때 이 목록도 함께 본다.
 */
const REFUND_SUMMARY: string[] = [
  "결제일로부터 7일 이내에 상담 시작 전 취소하면 전액 환불됩니다.",
  "7일이 지난 뒤에는 상담일까지 남은 기간에 따라 결제금액의 10~50%가 차감됩니다.",
  "이미 진행한 상담 회차는 환불 대상에서 제외되고, 남은 회차 금액은 환불됩니다.",
  "상담일 2일 전까지 1회에 한해 무료로 일정을 변경할 수 있습니다.",
];

/**
 * 견적 요청. 금액은 보내지 않는다. 서버가 같은 선택으로 다시 계산한다. (ADR-0003)
 * 받는 개인정보는 연락 수단뿐이고(ADR-0013), 수집 전에 동의를 받는다. (ADR-0018)
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
  // 동의는 둘이고 둘 다 필수다. 근거 법이 달라 한 값으로 묶지 않는다. (ADR-0042)
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [refundConsent, setRefundConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bothConsented = privacyConsent && refundConsent;

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
        privacyConsent,
        refundPolicyConsent: refundConsent,
        customer: { name, phone, email },
      }),
    });
    const body = await response.json();

    if (body.ok !== true) {
      setError(body.error ?? "플랜을 저장하지 못했습니다. 다시 시도해 주세요.");
      setSaving(false);
      return;
    }

    // 이동이 끝날 때까지 버튼을 잠근 채로 둔다. 두 번 누르면 견적이 두 건 생긴다.
    router.push(`/q/${body.publicId}`);
  }

  return (
    <form className="request" onSubmit={submit}>
      <h3>플랜 요청</h3>
      <p className="hint">
        연락받을 정보만 남겨 주세요. 저장 후 플랜 주소를 보여드립니다.
      </p>

      {/* 수집 전에 고지하고 동의를 받는다. 고지 없이 입력란을 먼저 보여주지 않는다. (ADR-0018) */}
      <section className="consent" aria-labelledby="consent-title">
        <h4 id="consent-title">개인정보 수집·이용 동의</h4>
        <dl>
          {CONSENT_NOTICE.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
        {/*
          전문은 새 탭으로 연다. 같은 탭에서 이동하면 고른 항목이 전부 사라진다.
          선택은 클라이언트 상태이고 URL 에 없다. (ADR-0042)
        */}
        <p className="consent-more">
          <a href="/privacy" target="_blank" rel="noopener noreferrer">
            개인정보 처리방침 전문 보기
          </a>
        </p>
        <div className="consent-check">
          <input
            type="checkbox"
            id="privacy-consent"
            checked={privacyConsent}
            onChange={(event) => setPrivacyConsent(event.target.checked)}
          />
          <label htmlFor="privacy-consent">
            <strong>[필수]</strong> 개인정보 수집·이용에 동의합니다.
          </label>
        </div>
      </section>

      {/* 결제 방식을 고르기 전에 거래 조건을 고지한다. 근거 법이 달라 동의도 따로 받는다. (ADR-0042) */}
      <section className="consent" aria-labelledby="refund-consent-title">
        <h4 id="refund-consent-title">취소 및 환불 규정 동의</h4>
        <ul className="consent-list">
          {REFUND_SUMMARY.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="consent-more">
          <a href="/refund" target="_blank" rel="noopener noreferrer">
            취소 및 환불 규정 전문 보기
          </a>
        </p>
        <div className="consent-check">
          <input
            type="checkbox"
            id="refund-consent"
            checked={refundConsent}
            onChange={(event) => setRefundConsent(event.target.checked)}
          />
          <label htmlFor="refund-consent">
            <strong>[필수]</strong> 취소 및 환불 규정에 동의합니다.
          </label>
        </div>
      </section>

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

      <button
        type="submit"
        className="primary"
        disabled={!ready || !bothConsented || saving}
      >
        {saving ? "저장 중…" : "이 금액으로 플랜 요청"}
      </button>
      {!ready && (
        <p className="hint">항목을 선택하면 플랜을 요청할 수 있습니다.</p>
      )}
      {ready && !bothConsented && (
        <p className="hint">
          개인정보 수집·이용과 취소·환불 규정에 모두 동의하면 요청할 수
          있습니다.
        </p>
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
  // 계산이 실패하면 아무것도 말하지 않는 빈 화면이 된다. 금액이 안 나온 이유는 말해야 한다. (ADR-0021)
  const [estimateFailed, setEstimateFailed] = useState(false);

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
          // 서버 예외는 JSON 이 아니다. 파싱하기 전에 걸러야 한다. (ADR-0021)
          if (response.status >= 500) {
            if (latestRequest.current !== requestId) return;
            setResult(null);
            setViolations([]);
            setEstimateFailed(true);
            setCalculating(false);
            return;
          }

          const body = await response.json();
          // 응답 도착 순서를 신뢰하지 않는다. 마지막 요청의 응답만 반영한다.
          if (latestRequest.current !== requestId) return;

          setEstimateFailed(false);
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
          if (latestRequest.current !== requestId) return;
          // 네트워크가 끊겨도 금액이 없는 이유는 말해야 한다.
          setResult(null);
          setViolations([]);
          setEstimateFailed(true);
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
                <Description summary={group.summary} detail={group.detail} />
                {locked && (
                  <p className="lock-hint">
                    <span aria-hidden="true">🔒</span>
                    먼저 &apos;{prerequisite.name}&apos; 항목을 선택해 주세요.
                  </p>
                )}
                {group.options.map((option) => (
                  // 설명은 label 바깥에 둔다. 라벨 안에 있으면 설명을 읽으려 누른 동작이
                  // 선택을 토글한다. (ADR-0025)
                  <div className="option-item" key={option.id}>
                    <div className="option-row">
                      <input
                        type={group.singleSelect ? "radio" : "checkbox"}
                        id={`option-${option.id}`}
                        name={`group-${group.id}`}
                        checked={optionIds.includes(option.id)}
                        readOnly
                        onClick={() => toggleOption(group, option.id)}
                      />
                      <label htmlFor={`option-${option.id}`}>
                        {option.name}
                      </label>
                    </div>
                    <Description
                      summary={option.summary}
                      detail={option.detail}
                    />
                  </div>
                ))}
                {violation && (
                  <p className="group-error">{violation.message}</p>
                )}
              </fieldset>
            );
          })}
        </div>

        <aside className="summary">
          <h2>맞춤형 플랜 요약</h2>

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

            {!calculating && estimateFailed && (
              <p className="form-error" role="alert">
                금액을 계산하지 못했습니다. 잠시 후 다시 선택해 주세요.
              </p>
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
                      <td className="label">소계</td>
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
                    <small>현금가</small>
                  </dt>
                  <dd>{formatKRW(result.totalAmount)}</dd>
                </dl>
                {/* 안내는 금액을 바꾸지 않는다. 바꾸는 것은 고객이 누를 때뿐이다. (ADR-0037) */}
                {result.bundleSuggestions.map((suggestion) => (
                  <div className="bundle-suggestion" key={suggestion.optionId}>
                    <p>
                      <strong>{suggestion.name}</strong> 로 바꾸면{" "}
                      {formatKRW(suggestion.savingAmount)} 저렴합니다.
                    </p>
                    <button
                      type="button"
                      onClick={() => setOptionIds(suggestion.nextOptionIds)}
                    >
                      묶음으로 바꾸기
                    </button>
                  </div>
                ))}
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
        <span className="label">총액 (현금가)</span>
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
