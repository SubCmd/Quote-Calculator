"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatKRW } from "@/lib/money";
import type { AdminProductView } from "@/services/admin/pricing-admin";

type Product = AdminProductView;
type OptionRow = Product["options"][number];
type DiscountRow = Product["discounts"][number];

interface Preview {
  before: { totalAmount: number } | null;
  after: { totalAmount: number } | null;
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(parsed.error ?? "요청에 실패했습니다.");
  return parsed;
}

/** 할인 조건에 적힌 옵션 코드를 지금 유효한 버전 id 로 바꾼다. 미리보기 샘플 선택에 쓴다. */
function sampleSelection(product: Product, discount: DiscountRow): string[] {
  if (discount.conditions.length === 0) {
    const first = product.options[0];
    return first ? [first.versionId] : [];
  }
  return discount.conditions.flatMap((condition) => {
    const option = product.options.find(
      (o) =>
        o.groupCode === condition.groupCode && o.code === condition.optionCode,
    );
    return option ? [option.versionId] : [];
  });
}

function PreviewLine({ preview }: { preview: Preview }) {
  if (!preview.before || !preview.after) {
    return (
      <p className="preview unavailable">이 선택으로는 계산할 수 없습니다.</p>
    );
  }
  const changed = preview.before.totalAmount !== preview.after.totalAmount;
  return (
    <p className="preview">
      샘플 총액 {formatKRW(preview.before.totalAmount)} →{" "}
      <strong>{formatKRW(preview.after.totalAmount)}</strong>
      {!changed && <span className="muted"> (변화 없음)</span>}
    </p>
  );
}

function EffectiveFromField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <>
      <label htmlFor={id} className="field-label">
        적용 시작
      </label>
      <input
        id={id}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  );
}

function OptionEditor({
  product,
  option,
}: {
  product: Product;
  option: OptionRow;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(option.amount));
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nextAmount = Number(amount);
  const valid = Number.isInteger(nextAmount) && nextAmount >= 0;
  const dirty = valid && nextAmount !== option.amount;

  async function runPreview() {
    setBusy(true);
    setError(null);
    try {
      const result = await postJson("/api/admin/preview", {
        productId: product.id,
        optionIds: [option.versionId],
        change: {
          kind: "option",
          optionVersionId: option.versionId,
          amount: nextAmount,
        },
      });
      setPreview(result);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function save() {
    const summary = `${option.name} 금액을 ${formatKRW(option.amount)} → ${formatKRW(nextAmount)} 로 바꾸는 새 버전을 추가합니다. 기존 값은 그대로 남습니다.\n\n계속할까요?`;
    if (!window.confirm(summary)) return;

    setBusy(true);
    setError(null);
    try {
      await postJson("/api/admin/pricing", {
        kind: "option",
        productId: product.id,
        groupCode: option.groupCode,
        optionCode: option.code,
        optionVersionId: option.versionId,
        amount: nextAmount,
        effectiveFrom: effectiveFrom || undefined,
      });
      setPreview(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <tr>
      <td>
        <span className="row-name">{option.name}</span>
        <span className="row-meta">
          {option.groupName} · v{option.versionCount}
        </span>
      </td>
      <td className="num">{formatKRW(option.amount)}</td>
      <td>
        <label htmlFor={`amount-${option.versionId}`} className="sr-only">
          {option.name} 새 금액
        </label>
        <input
          id={`amount-${option.versionId}`}
          type="number"
          min={0}
          step={10}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="num-input"
        />
      </td>
      <td className="effective">
        <EffectiveFromField
          id={`from-${option.versionId}`}
          value={effectiveFrom}
          onChange={setEffectiveFrom}
        />
        <span className="hint">비우면 즉시 적용</span>
      </td>
      <td className="actions">
        <button
          type="button"
          className="ghost"
          onClick={runPreview}
          disabled={!dirty || busy}
        >
          미리보기
        </button>
        <button
          type="button"
          className="primary"
          onClick={save}
          disabled={!dirty || busy}
        >
          새 버전 저장
        </button>
        {preview && <PreviewLine preview={preview} />}
        {error && <p className="form-error">{error}</p>}
      </td>
    </tr>
  );
}

function DiscountEditor({
  product,
  discount,
}: {
  product: Product;
  discount: DiscountRow;
}) {
  const router = useRouter();
  const isRate = discount.type === "RATE";
  const [value, setValue] = useState(
    isRate ? discount.ratePercent : String(discount.amount),
  );
  const [priority, setPriority] = useState(String(discount.priority));
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 화면은 퍼센트로 받고 서버에는 만분율 정수(bp)로 보낸다. (.claude/rules/pricing.md)
  const rateBp = isRate ? Math.round(Number(value) * 100) : 0;
  const amount = isRate ? 0 : Number(value);
  const nextPriority = Number(priority);

  const valid =
    Number.isFinite(Number(value)) &&
    Number(value) >= 0 &&
    Number.isInteger(nextPriority) &&
    (isRate ? rateBp <= 10_000 : Number.isInteger(amount));
  const dirty =
    valid &&
    (isRate
      ? rateBp !== Math.round(Number(discount.ratePercent) * 100)
      : amount !== discount.amount);
  const priorityChanged = valid && nextPriority !== discount.priority;
  const canSubmit = (dirty || priorityChanged) && !busy;

  const change = {
    kind: "discount" as const,
    discountVersionId: discount.versionId,
    amount,
    rateBp,
    priority: nextPriority,
  };

  async function runPreview() {
    setBusy(true);
    setError(null);
    try {
      const result = await postJson("/api/admin/preview", {
        productId: product.id,
        optionIds: sampleSelection(product, discount),
        change,
      });
      setPreview(result);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function save() {
    const before = isRate
      ? `${discount.ratePercent}%`
      : formatKRW(discount.amount);
    const after = isRate ? `${(rateBp / 100).toFixed(2)}%` : formatKRW(amount);
    const summary = `${discount.name}\n· 할인 ${before} → ${after}\n· 우선순위 ${discount.priority} → ${nextPriority}\n\n새 버전을 추가합니다. 기존 값은 그대로 남습니다. 계속할까요?`;
    if (!window.confirm(summary)) return;

    setBusy(true);
    setError(null);
    try {
      await postJson("/api/admin/pricing", {
        kind: "discount",
        productId: product.id,
        discountCode: discount.code,
        discountVersionId: discount.versionId,
        amount,
        rateBp,
        priority: nextPriority,
        effectiveFrom: effectiveFrom || undefined,
      });
      setPreview(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <tr>
      <td>
        <span className="row-name">{discount.name}</span>
        <span className="row-meta">
          {discount.conditions.length === 0
            ? "조건 없음 · 항상 적용"
            : `조건 ${discount.conditions.length}개`}{" "}
          · v{discount.versionCount}
        </span>
      </td>
      <td className="num">
        {isRate ? `${discount.ratePercent}%` : formatKRW(discount.amount)}
      </td>
      <td>
        <label htmlFor={`value-${discount.versionId}`} className="sr-only">
          {discount.name} 새 {isRate ? "할인율" : "할인액"}
        </label>
        <input
          id={`value-${discount.versionId}`}
          type="number"
          min={0}
          step={isRate ? 0.01 : 10}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="num-input"
        />
        <span className="unit">{isRate ? "%" : "원"}</span>
      </td>
      <td className="effective">
        <label
          htmlFor={`priority-${discount.versionId}`}
          className="field-label"
        >
          우선순위
        </label>
        <input
          id={`priority-${discount.versionId}`}
          type="number"
          min={0}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="num-input narrow"
        />
        <EffectiveFromField
          id={`dfrom-${discount.versionId}`}
          value={effectiveFrom}
          onChange={setEffectiveFrom}
        />
        <span className="hint">비우면 즉시 적용</span>
      </td>
      <td className="actions">
        <button
          type="button"
          className="ghost"
          onClick={runPreview}
          disabled={!canSubmit}
        >
          미리보기
        </button>
        <button
          type="button"
          className="primary"
          onClick={save}
          disabled={!canSubmit}
        >
          새 버전 저장
        </button>
        {preview && <PreviewLine preview={preview} />}
        {error && <p className="form-error">{error}</p>}
      </td>
    </tr>
  );
}

export function PricingAdmin({ products }: { products: Product[] }) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const product = products.find((p) => p.id === productId);

  if (!product) return <p className="empty-note">등록된 상품이 없습니다.</p>;

  return (
    <>
      <div className="tabs" role="tablist" aria-label="상품">
        {products.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            id={`admin-tab-${p.id}`}
            aria-selected={p.id === productId}
            aria-controls="admin-panel"
            className={p.id === productId ? "tab selected" : "tab"}
            onClick={() => setProductId(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div
        id="admin-panel"
        role="tabpanel"
        aria-labelledby={`admin-tab-${productId}`}
      >
        <section className="card">
          <h2>옵션 금액</h2>
          <table className="rules">
            <thead>
              <tr>
                <th>옵션</th>
                <th className="num">현재</th>
                <th>새 금액</th>
                <th>적용</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {product.options.map((option) => (
                <OptionEditor
                  key={option.versionId}
                  product={product}
                  option={option}
                />
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>할인 규칙</h2>
          {product.discounts.length === 0 ? (
            <p className="empty-note">이 상품에는 할인 규칙이 없습니다.</p>
          ) : (
            <table className="rules">
              <thead>
                <tr>
                  <th>할인</th>
                  <th className="num">현재</th>
                  <th>새 값</th>
                  <th>적용</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {product.discounts.map((discount) => (
                  <DiscountEditor
                    key={discount.versionId}
                    product={product}
                    discount={discount}
                  />
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
