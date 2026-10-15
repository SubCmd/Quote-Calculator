"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatKRW } from "@/lib/money";
import { resolveOrderInput } from "@/lib/order-input";
import type { AdminProductView } from "@/services/admin/pricing-admin";

type Product = AdminProductView;
type OptionRow = Product["options"][number];
type InactiveOptionRow = Product["inactiveOptions"][number];
type DiscountRow = Product["discounts"][number];
type BundleRowView = Product["bundles"][number];

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

/**
 * 설명 편집 대상. 단계와 옵션은 저장 동작이 같고 가리키는 대상만 다르다. (ADR-0025)
 * `optionCode` 가 있으면 옵션, 없으면 단계다.
 */
interface DescriptionTarget {
  kind: "group-description" | "option-description";
  /** 입력 id 와 React key */
  id: string;
  name: string;
  context: string;
  groupCode: string;
  optionCode?: string;
  summary: string | null;
  detail: string | null;
}

/** 단계 바로 아래에 그 단계의 옵션을 늘어놓는다. 화면에 보이는 순서와 같게 한다. */
function descriptionTargets(product: Product): DescriptionTarget[] {
  return product.groups.flatMap((group) => [
    {
      kind: "group-description" as const,
      id: `g-${group.code}`,
      name: group.name,
      context: "단계",
      groupCode: group.code,
      summary: group.summary,
      detail: group.detail,
    },
    ...product.options
      .filter((option) => option.groupCode === group.code)
      .map((option) => ({
        kind: "option-description" as const,
        id: `o-${group.code}-${option.code}`,
        name: option.name,
        context: `${group.name} 옵션`,
        groupCode: group.code,
        optionCode: option.code,
        summary: option.summary,
        detail: option.detail,
      })),
  ]);
}

/**
 * 설명 문구 편집. 금액을 바꾸지 않으므로 미리보기도, 적용 시작 시각도 없다. (ADR-0025)
 * 새 버전을 만들지 않고 덮어쓴다. 비우고 저장하면 설명이 사라지는 것이 정상 동작이다.
 */
function DescriptionEditor({
  product,
  target,
}: {
  product: Product;
  target: DescriptionTarget;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState(target.summary ?? "");
  const [detail, setDetail] = useState(target.detail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const nextSummary = summary.trim();
  const nextDetail = detail.trim();
  const dirty =
    nextSummary !== (target.summary ?? "") ||
    nextDetail !== (target.detail ?? "");
  // 지우는 것도 정상 저장이지만 되돌릴 수 없으므로 확인을 받는다.
  const clearing =
    (target.summary !== null && nextSummary === "") ||
    (target.detail !== null && nextDetail === "");

  async function save() {
    if (
      clearing &&
      !window.confirm(
        `'${target.name}' 의 설명을 지웁니다.\n\n고객 화면에서 이 안내가 사라집니다. 지운 문구는 되돌릴 수 없습니다.\n\n계속할까요?`,
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await postJson("/api/admin/pricing", {
        kind: target.kind,
        productId: product.id,
        groupCode: target.groupCode,
        optionCode: target.optionCode,
        summary: nextSummary || undefined,
        detail: nextDetail || undefined,
      });
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <tr>
      <td>
        <span className="row-name">{target.name}</span>
        <span className="row-meta">{target.context}</span>
      </td>
      <td>
        <label htmlFor={`summary-${target.id}`} className="field-label">
          한 줄 설명
        </label>
        <input
          id={`summary-${target.id}`}
          type="text"
          maxLength={120}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="이름 아래 항상 보이는 한 줄"
          className="text-input wide"
        />
        <label htmlFor={`detail-${target.id}`} className="field-label">
          자세한 설명
        </label>
        <textarea
          id={`detail-${target.id}`}
          maxLength={2000}
          rows={3}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="'자세히' 를 눌러 펼치는 긴 안내. 비우면 '자세히' 가 나오지 않습니다."
          className="text-input detail-input"
        />
      </td>
      <td className="actions">
        <button
          type="button"
          className="primary"
          onClick={save}
          disabled={!dirty || busy}
        >
          설명 저장
        </button>
        {saved && !dirty && <p className="preview">저장했습니다.</p>}
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

  /**
   * 할인만 끈다. 조건 옵션은 그대로 남는다. 옵션 비활성화와 방향이 다르다. (ADR-0026)
   * 조건으로 쓰인 옵션 이름을 확인 문구에 적어, 그 옵션이 사라지는 것으로 오해하지 않게 한다.
   */
  async function deactivate() {
    const conditionNames = discount.conditions
      .map(
        (c) =>
          product.options.find(
            (o) => o.groupCode === c.groupCode && o.code === c.optionCode,
          )?.name ?? c.optionCode,
      )
      .join(", ");
    const note =
      discount.conditions.length === 0
        ? ""
        : `\n조건 옵션(${conditionNames})은 그대로 남아 계속 고를 수 있습니다.`;
    if (
      !window.confirm(
        `${discount.name} 을 비활성화합니다.\n이 할인은 더 이상 계산에 들어가지 않습니다.${note}\n\n계속할까요?`,
      )
    )
      return;

    setBusy(true);
    setError(null);
    try {
      await postJson("/api/admin/pricing", {
        kind: "deactivate-discount",
        productId: product.id,
        discountCode: discount.code,
      });
      router.refresh();
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

interface OrderItem {
  key: string;
  label: string;
  /** 꺼진 옵션처럼 그 줄에 붙는 상태 표시 */
  note?: string;
}

/**
 * 묶음 관계에 고를 수 있는 옵션. **꺼진 옵션도 담는다.** (ADR-0038)
 * 옵션을 껐다 켜는 것과 묶음 관계는 독립이라, 되살릴 옵션으로 미리 묶어 둘 수 있어야 한다.
 */
interface BundleChoice {
  key: string;
  groupCode: string;
  optionCode: string;
  label: string;
}

function bundleChoices(product: Product): BundleChoice[] {
  return [
    ...product.options.map((option) => ({
      key: `${option.groupCode}:${option.code}`,
      groupCode: option.groupCode,
      optionCode: option.code,
      label: `${option.groupName} · ${option.name}`,
    })),
    ...product.inactiveOptions.map((option) => ({
      key: `${option.groupCode}:${option.code}`,
      groupCode: option.groupCode,
      optionCode: option.code,
      label: `${option.groupName} · ${option.name} (꺼짐)`,
    })),
  ];
}

/**
 * 묶음 관계 한 줄. **수정 버튼이 없다.** (ADR-0038)
 * 구성 하나를 바꾸는 것은 지우고 다시 넣는 것이고, 구성이 1개뿐인 중간 상태에는 뜻이 없다.
 */
function BundleRow({
  product,
  bundle,
}: {
  product: Product;
  bundle: BundleRowView;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    const components = bundle.components.map((c) => c.name).join("\n· ");
    const summary = `'${bundle.name}' 의 묶음 관계를 지웁니다.\n\n구성 ${bundle.components.length}개\n· ${components}\n\n이 구성을 고른 고객에게 뜨던 안내가 사라집니다. 옵션과 금액은 그대로입니다.\n\n계속할까요?`;
    if (!window.confirm(summary)) return;

    setBusy(true);
    setError(null);
    try {
      await postJson("/api/admin/pricing", {
        kind: "remove-bundle",
        productId: product.id,
        groupCode: bundle.groupCode,
        optionCode: bundle.optionCode,
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
        <span className="row-name">{bundle.name}</span>
        <span className="row-meta">
          {bundle.groupCode} · {bundle.optionCode}
        </span>
      </td>
      <td>
        {bundle.components.map((component) => (
          <span
            key={`${component.groupCode}:${component.optionCode}`}
            className="row-name"
          >
            {component.name}
          </span>
        ))}
      </td>
      <td>
        {bundle.active ? (
          <span className="row-meta">
            구성을 전부 고르고 묶음이 더 싸면 안내됩니다
          </span>
        ) : (
          <span className="row-meta blocked">
            꺼진 옵션이 있어 안내되지 않습니다. 되살리면 그대로 돌아옵니다
          </span>
        )}
      </td>
      <td className="actions">
        <button
          type="button"
          className="ghost danger"
          onClick={remove}
          disabled={busy}
        >
          지우기
        </button>
        {error && <p className="form-error">{error}</p>}
      </td>
    </tr>
  );
}

/**
 * 묶음 관계 등록. 계산 미리보기가 없다. 관계는 금액에 들어가지 않는다. (ADR-0038)
 * 묶음 옵션은 구성 목록에서 빠진다. 자기를 자기로 바꾸라는 안내가 되는 조합이다.
 */
function NewBundleForm({ product }: { product: Product }) {
  const router = useRouter();
  const choices = bundleChoices(product);
  const [bundleKey, setBundleKey] = useState(choices[0]?.key ?? "");
  const [componentKeys, setComponentKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const bundle = choices.find((choice) => choice.key === bundleKey);
  const componentChoices = choices.filter((choice) => choice.key !== bundleKey);
  const valid = bundle !== undefined && componentKeys.length >= 2;

  function toggle(key: string) {
    setComponentKeys((keys) =>
      keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key],
    );
  }

  async function save() {
    if (!bundle) return;
    const picked = componentKeys.flatMap((key) =>
      choices.filter((choice) => choice.key === key),
    );
    const summary = `'${bundle.label}' 를 묶음으로 등록합니다.\n\n구성 ${picked.length}개\n· ${picked
      .map((choice) => choice.label)
      .join(
        "\n· ",
      )}\n\n이 구성을 전부 고른 고객에게 묶음이 더 싸면 안내가 뜹니다. 금액은 바뀌지 않습니다.\n\n계속할까요?`;
    if (!window.confirm(summary)) return;

    setBusy(true);
    setError(null);
    try {
      await postJson("/api/admin/pricing", {
        kind: "add-bundle",
        productId: product.id,
        groupCode: bundle.groupCode,
        optionCode: bundle.optionCode,
        components: picked.map((choice) => ({
          groupCode: choice.groupCode,
          optionCode: choice.optionCode,
        })),
      });
      setComponentKeys([]);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  // 묶음 하나 + 구성 둘이 최소다. 그보다 적으면 만들 수 있는 관계가 없다.
  if (choices.length < 3) {
    return (
      <p className="empty-note">
        묶음을 만들려면 이 상품에 옵션이 3개 이상 있어야 합니다.
      </p>
    );
  }

  return (
    <div className="new-bundle">
      <div className="new-option-field">
        <label htmlFor={`bundle-option-${product.id}`} className="field-label">
          묶음 옵션
        </label>
        <select
          id={`bundle-option-${product.id}`}
          value={bundleKey}
          onChange={(e) => {
            setBundleKey(e.target.value);
            setComponentKeys((keys) =>
              keys.filter((k) => k !== e.target.value),
            );
          }}
        >
          {choices.map((choice) => (
            <option key={choice.key} value={choice.key}>
              {choice.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="bundle-components">
        <legend className="field-label">구성 옵션 (2개 이상)</legend>
        {componentChoices.map((choice) => (
          <label key={choice.key}>
            <input
              type="checkbox"
              checked={componentKeys.includes(choice.key)}
              onChange={() => toggle(choice.key)}
            />
            {choice.label}
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        className="primary"
        onClick={save}
        disabled={!valid || busy}
      >
        묶음 등록
      </button>

      {!valid && (
        <p className="hint">
          구성 옵션을 2개 이상 고르세요. 1개면 묶음이 아니라 같은 것의 다른
          이름입니다.
        </p>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

/**
 * 순서 바꾸기 한 묶음. 각 줄에 **보일 자리 번호**를 적는다. (ADR-0032)
 * 저장할 때 보내는 것은 번호가 아니라 **전체 순열**이다. (ADR-0026)
 *
 * 줄은 번호를 고쳐도 제자리에 있고, 결과는 아래 미리보기가 보여준다.
 * 입력하는 칸이 커서 아래에서 움직이면 어느 줄을 고치던 중인지 놓친다.
 *
 * 입력값을 키로 들고 있어서 저장 뒤 서버 순서가 바뀌어도 줄마다 제 번호가 따라온다.
 * 다시 마운트하지 않아도 `되돌리기` 와 변경 여부가 새 순서를 기준으로 맞는다.
 */
function OrderList({
  items,
  onSave,
}: {
  items: OrderItem[];
  onSave: (keys: string[]) => Promise<void>;
}) {
  const router = useRouter();
  const initial = items.map((item) => item.key);
  const [positions, setPositions] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((item, index) => [item.key, `${index + 1}`])),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const labelByKey = new Map(items.map((item) => [item.key, item]));
  const { keys, error: inputError } = resolveOrderInput(
    items.map((item) => ({ key: item.key, value: positions[item.key] ?? "" })),
  );
  const changed = keys !== null && keys.some((key, i) => initial[i] !== key);

  function reset() {
    setPositions(
      Object.fromEntries(
        items.map((item, index) => [item.key, `${index + 1}`]),
      ),
    );
    setError(null);
  }

  async function save() {
    if (!keys) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(keys);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  if (items.length < 2)
    return <p className="empty-note">순서를 바꿀 항목이 2개 미만입니다.</p>;

  return (
    <>
      <ul className="order-list">
        {items.map((item) => (
          <li key={item.key}>
            <input
              id={`order-${item.key}`}
              className="order-number"
              type="number"
              min={1}
              max={items.length}
              step={1}
              inputMode="numeric"
              value={positions[item.key] ?? ""}
              onChange={(e) =>
                setPositions((prev) => ({
                  ...prev,
                  [item.key]: e.target.value,
                }))
              }
              disabled={busy}
              aria-label={`${item.label} 순서 번호`}
            />
            <label className="order-label" htmlFor={`order-${item.key}`}>
              {item.label}
              {item.note && <span className="row-meta">{item.note}</span>}
            </label>
          </li>
        ))}
      </ul>
      {inputError && <p className="form-error">{inputError}</p>}
      {keys && changed && (
        <ol className="order-preview">
          {keys.map((key) => (
            <li key={key}>{labelByKey.get(key)!.label}</li>
          ))}
        </ol>
      )}
      <div className="order-actions">
        <button type="button" className="ghost" onClick={reset} disabled={busy}>
          되돌리기
        </button>
        <button
          type="button"
          className="primary"
          onClick={save}
          disabled={!changed || busy}
        >
          순서 저장
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </>
  );
}

/**
 * 한 그룹 안의 옵션 순서. **꺼진 옵션도 함께 넣는다.** (ADR-0026)
 * 빼면 되살린 옵션이 제 자리로 돌아오지 못한다.
 */
function optionOrderItems(product: Product, groupCode: string): OrderItem[] {
  const active = product.options
    .filter((o) => o.groupCode === groupCode)
    .map((o) => ({ key: o.code, label: o.name, sortOrder: o.sortOrder }));
  const inactive = product.inactiveOptions
    .filter((o) => o.groupCode === groupCode)
    .map((o) => ({
      key: o.code,
      label: o.name,
      note: "꺼짐",
      sortOrder: o.sortOrder,
    }));
  return [...active, ...inactive].sort((a, b) => a.sortOrder - b.sortOrder);
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
          <h2>표시 순서</h2>
          <p className="hint">
            고객 화면에 보이는 순서입니다. 금액이 아니라 화면 배치라서 버전을
            남기지 않고 덮어씁니다. 이미 발행된 견적에는 영향이 없습니다.
          </p>

          <h3>단계</h3>
          <OrderList
            key={`groups-${product.id}`}
            items={product.groups.map((g) => ({ key: g.code, label: g.name }))}
            onSave={(groupCodes) =>
              postJson("/api/admin/pricing", {
                kind: "reorder-groups",
                productId: product.id,
                groupCodes,
              })
            }
          />

          {product.groups.map((group) => (
            <div key={group.code}>
              <h3>{group.name} 옵션</h3>
              <OrderList
                key={`options-${product.id}-${group.code}`}
                items={optionOrderItems(product, group.code)}
                onSave={(optionCodes) =>
                  postJson("/api/admin/pricing", {
                    kind: "reorder-options",
                    productId: product.id,
                    groupCode: group.code,
                    optionCodes,
                  })
                }
              />
            </div>
          ))}
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
          <h2>설명 문구</h2>
          <p className="hint">
            한 줄 설명은 이름 아래 항상 보입니다. 자세한 설명은 고객이
            &lsquo;자세히&rsquo;를 눌러 펼칩니다. 금액과 달리 버전을 남기지 않고
            덮어씁니다. 적용 시작 시각이 없어 저장하는 즉시 바뀝니다. 평문으로만
            보이므로 HTML 태그를 쓰지 마세요.
          </p>
          <table className="rules">
            <thead>
              <tr>
                <th>대상</th>
                <th>설명</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {descriptionTargets(product).map((target) => (
                <DescriptionEditor
                  key={target.id}
                  product={product}
                  target={target}
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

        <section className="card">
          <h2>묶음 관계</h2>
          <p className="hint">
            구성 옵션을 전부 고른 고객에게 더 싼 묶음이 있다고 안내합니다.
            금액을 깎지 않고, 바꾸는 것은 고객이 버튼을 눌렀을 때뿐입니다.
            관계는 금액이 아니라 안내라서 버전도 적용 시작 시각도 없습니다.
            묶음이 더 비싸면 저장은 되고 안내만 뜨지 않습니다.
          </p>
          {product.bundles.length === 0 ? (
            <p className="empty-note">이 상품에는 묶음 관계가 없습니다.</p>
          ) : (
            <table className="rules">
              <thead>
                <tr>
                  <th>묶음 옵션</th>
                  <th>구성 옵션</th>
                  <th>상태</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {product.bundles.map((bundle) => (
                  <BundleRow
                    key={`${bundle.groupCode}:${bundle.optionCode}`}
                    product={product}
                    bundle={bundle}
                  />
                ))}
              </tbody>
            </table>
          )}

          <h3>묶음 추가</h3>
          <NewBundleForm key={`new-bundle-${product.id}`} product={product} />
        </section>
      </div>

      {/* 탭 순서는 상품 하나에 딸린 설정이 아니라 목록 전체의 설정이라 탭 바깥에 둔다. */}
      <section className="card">
        <h2>상품 탭 순서</h2>
        <p className="hint">
          고객 화면 맨 위 탭이 보이는 순서입니다. 관리자 화면 탭도 같이
          바뀝니다.
        </p>
        <OrderList
          items={products.map((p) => ({ key: p.code, label: p.name }))}
          onSave={(productCodes) =>
            postJson("/api/admin/pricing", {
              kind: "reorder-products",
              productCodes,
            })
          }
        />
      </section>
    </>
  );
}
