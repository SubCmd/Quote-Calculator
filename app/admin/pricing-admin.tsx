"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatKRW } from "@/lib/money";
import type { AdminProductView } from "@/services/admin/pricing-admin";

type Product = AdminProductView;
type OptionRow = Product["options"][number];
type InactiveOptionRow = Product["inactiveOptions"][number];
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

/**
 * 이 옵션을 조건으로 쓰는 할인. 비활성화하면 함께 꺼지므로 확인 단계에서 보여준다. (ADR-0017)
 * 화면에 이미 내려온 조건 목록을 거르는 것뿐이고, 판단은 서버가 다시 한다.
 */
function discountsDependingOn(product: Product, option: OptionRow) {
  return product.discounts.filter((discount) =>
    discount.conditions.some(
      (c) => c.groupCode === option.groupCode && c.optionCode === option.code,
    ),
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
  const [name, setName] = useState(option.name);
  const [amount, setAmount] = useState(String(option.amount));
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nextAmount = Number(amount);
  const nextName = name.trim();
  const valid =
    Number.isInteger(nextAmount) && nextAmount >= 0 && nextName.length > 0;
  const amountChanged = valid && nextAmount !== option.amount;
  const nameChanged = valid && nextName !== option.name;
  // 이름만 바뀌었을 때는 미리보기할 것이 없다. 금액이 그대로라 계산 결과도 그대로다.
  const canSubmit = (amountChanged || nameChanged) && !busy;

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
    const changes = [
      nameChanged ? `· 이름 ${option.name} → ${nextName}` : null,
      amountChanged
        ? `· 금액 ${formatKRW(option.amount)} → ${formatKRW(nextAmount)}`
        : null,
    ].filter((line) => line !== null);
    const summary = `${option.name}\n${changes.join("\n")}\n\n새 버전을 추가합니다. 기존 값은 그대로 남습니다. 옵션 코드(${option.code})는 바뀌지 않습니다.\n\n계속할까요?`;
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
        name: nextName,
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

  async function deactivate() {
    const affected = discountsDependingOn(product, option);
    const impact =
      affected.length === 0
        ? "이 옵션을 조건으로 쓰는 할인은 없습니다."
        : `이 옵션을 조건으로 쓰는 할인 ${affected.length}개도 함께 비활성화됩니다.\n· ${affected
            .map((d) => d.name)
            .join("\n· ")}`;
    const summary = `'${option.name}' 을 비활성화합니다.\n\n${impact}\n\n새 견적에서 더는 고를 수 없습니다. 이미 저장된 견적의 금액은 그대로입니다. 아래 '꺼진 옵션' 목록에서 다시 켤 수 있습니다.\n\n계속할까요?`;
    if (!window.confirm(summary)) return;

    setBusy(true);
    setError(null);
    try {
      await postJson("/api/admin/pricing", {
        kind: "deactivate-option",
        productId: product.id,
        groupCode: option.groupCode,
        optionCode: option.code,
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
        <label htmlFor={`name-${option.versionId}`} className="sr-only">
          {option.name} 새 이름
        </label>
        <input
          id={`name-${option.versionId}`}
          type="text"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="text-input"
        />
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
          disabled={!amountChanged || busy}
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
        <button
          type="button"
          className="ghost danger"
          onClick={deactivate}
          disabled={busy}
        >
          비활성화
        </button>
        {preview && <PreviewLine preview={preview} />}
        {error && <p className="form-error">{error}</p>}
      </td>
    </tr>
  );
}

/**
 * 신규 옵션. 기존 그룹 안에만 만든다. 그룹은 여기서 만들지 않는다. (ADR-0023)
 * 계산 미리보기가 없다. 비교할 이전값이 없어서 그 옵션만 고른 계산 결과는 입력한 금액 그 자체다.
 * 대신 확인 창에서 포맷한 금액을 보여준다. 실제 사고는 0 을 하나 더 치는 쪽이다.
 */
function NewOptionForm({ product }: { product: Product }) {
  const router = useRouter();
  const [groupCode, setGroupCode] = useState(product.groups[0]?.code ?? "");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("0");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nextCode = code.trim().toUpperCase();
  const nextName = name.trim();
  const nextAmount = Number(amount);
  const group = product.groups.find((g) => g.code === groupCode);
  const valid =
    group !== undefined &&
    /^[A-Z][A-Z0-9_]*$/.test(nextCode) &&
    nextName.length > 0 &&
    Number.isInteger(nextAmount) &&
    nextAmount >= 0;

  async function save() {
    if (!group) return;
    const summary = `'${group.name}' 그룹에 새 옵션을 추가합니다.\n\n· 코드 ${nextCode} (나중에 바꿀 수 없습니다)\n· 이름 ${nextName}\n· 금액 ${formatKRW(nextAmount)}\n\n계속할까요?`;
    if (!window.confirm(summary)) return;

    setBusy(true);
    setError(null);
    try {
      await postJson("/api/admin/pricing", {
        kind: "create-option",
        productId: product.id,
        groupCode,
        optionCode: nextCode,
        name: nextName,
        amount: nextAmount,
        effectiveFrom: effectiveFrom || undefined,
      });
      setCode("");
      setName("");
      setAmount("0");
      setEffectiveFrom("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  if (product.groups.length === 0) {
    return <p className="empty-note">이 상품에는 옵션 그룹이 없습니다.</p>;
  }

  return (
    <div className="new-option">
      <div className="new-option-field">
        <label htmlFor={`new-group-${product.id}`} className="field-label">
          그룹
        </label>
        <select
          id={`new-group-${product.id}`}
          value={groupCode}
          onChange={(e) => setGroupCode(e.target.value)}
        >
          {product.groups.map((g) => (
            <option key={g.code} value={g.code}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <div className="new-option-field">
        <label htmlFor={`new-code-${product.id}`} className="field-label">
          코드
        </label>
        <input
          id={`new-code-${product.id}`}
          type="text"
          maxLength={40}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="NAESIN"
          className="text-input code"
        />
      </div>

      <div className="new-option-field">
        <label htmlFor={`new-name-${product.id}`} className="field-label">
          이름
        </label>
        <input
          id={`new-name-${product.id}`}
          type="text"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="내신 성적 분석"
          className="text-input"
        />
      </div>

      <div className="new-option-field">
        <label htmlFor={`new-amount-${product.id}`} className="field-label">
          금액 (원)
        </label>
        <input
          id={`new-amount-${product.id}`}
          type="number"
          min={0}
          step={10}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="num-input"
        />
      </div>

      <div className="new-option-field">
        <EffectiveFromField
          id={`new-from-${product.id}`}
          value={effectiveFrom}
          onChange={setEffectiveFrom}
        />
      </div>

      <button
        type="button"
        className="primary"
        onClick={save}
        disabled={!valid || busy}
      >
        옵션 추가
      </button>

      <p className="hint">
        코드는 대문자로 시작하고 대문자·숫자·밑줄만 쓸 수 있습니다. 할인 조건이
        이 코드로 옵션을 가리키므로 나중에 바꿀 수 없습니다. 적용 시작을 비우면
        즉시 적용입니다. 모든 금액은 부가세 포함입니다.
      </p>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

/**
 * 꺼진 옵션 한 줄. 되살리면 함께 켜지는 할인과 그대로 꺼져 있을 할인을 확인 창에 모두 적는다.
 * 어느 쪽인지는 서버와 같은 순수 함수가 이미 판정해서 내려보냈다. (ADR-0023)
 */
function InactiveOptionEditor({
  product,
  option,
}: {
  product: Product;
  option: InactiveOptionRow;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reactivate() {
    const revived =
      option.reactivatableDiscounts.length === 0
        ? "함께 되살아나는 할인은 없습니다."
        : `함께 되살아나는 할인 ${option.reactivatableDiscounts.length}개\n· ${option.reactivatableDiscounts
            .map((d) => d.name)
            .join("\n· ")}`;
    const blocked =
      option.blockedDiscounts.length === 0
        ? ""
        : `\n\n조건 옵션이 아직 꺼져 있어 그대로 꺼져 있을 할인 ${option.blockedDiscounts.length}개\n· ${option.blockedDiscounts
            .map((d) => `${d.name} (${d.missing.join(", ")} 필요)`)
            .join("\n· ")}`;
    const summary = `'${option.name}' 을 다시 켭니다.\n\n${revived}${blocked}\n\n새 견적에서 다시 고를 수 있게 됩니다. 금액은 끄기 전 값(${formatKRW(option.amount)}) 그대로입니다.\n\n계속할까요?`;
    if (!window.confirm(summary)) return;

    setBusy(true);
    setError(null);
    try {
      await postJson("/api/admin/pricing", {
        kind: "reactivate-option",
        productId: product.id,
        groupCode: option.groupCode,
        optionCode: option.code,
      });
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
          {option.groupName} · {option.code} · v{option.versionCount}
        </span>
      </td>
      <td className="num">{formatKRW(option.amount)}</td>
      <td>
        {option.reactivatableDiscounts.length === 0 &&
        option.blockedDiscounts.length === 0 ? (
          <span className="row-meta">함께 꺼진 할인 없음</span>
        ) : (
          <>
            {option.reactivatableDiscounts.map((d) => (
              <span key={d.code} className="row-meta">
                함께 켜짐 · {d.name}
              </span>
            ))}
            {option.blockedDiscounts.map((d) => (
              <span key={d.code} className="row-meta blocked">
                보류 · {d.name} ({d.missing.join(", ")} 필요)
              </span>
            ))}
          </>
        )}
      </td>
      <td className="actions">
        <button
          type="button"
          className="primary"
          onClick={reactivate}
          disabled={busy}
        >
          다시 켜기
        </button>
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
          <h2>옵션</h2>
          <table className="rules">
            <thead>
              <tr>
                <th>옵션</th>
                <th className="num">현재</th>
                <th>새 이름 · 금액</th>
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
          <h2>옵션 추가</h2>
          <NewOptionForm product={product} />
        </section>

        {product.inactiveOptions.length > 0 && (
          <section className="card">
            <h2>꺼진 옵션</h2>
            <table className="rules">
              <thead>
                <tr>
                  <th>옵션</th>
                  <th className="num">금액</th>
                  <th>함께 꺼진 할인</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {product.inactiveOptions.map((option) => (
                  <InactiveOptionEditor
                    key={option.versionId}
                    product={product}
                    option={option}
                  />
                ))}
              </tbody>
            </table>
          </section>
        )}

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
