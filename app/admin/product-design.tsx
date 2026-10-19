"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { canSetProductActive } from "@/lib/product-activation";
import type { ProductDesignRow } from "@/services/admin/product-design";

/**
 * 상품(상위 탭)과 단계(그룹) 신설, 상품 활성화. (ADR-0046)
 *
 * 금액 운영 화면(`pricing-admin.tsx`)과 나눠 둔다. 여기에는 적용 시작 시각도
 * 미리보기도 없다. 상품과 단계는 금액을 만들지 않는다.
 * 비활성 상품도 목록에 보인다. 보이지 않으면 방금 만든 상품을 켤 수 없다.
 */

type Group = ProductDesignRow["groups"][number];

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

const CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/** 단계 한 줄에 적는 성질. 값에서 만든다. 상품 코드로 분기하지 않는다. */
function groupTraits(group: Group): string[] {
  // 고를 것이 없는 단계라 필수·단일 선택을 적어 봐야 뜻이 없다. (ADR-0048)
  if (group.noticeOnly) return ["안내 전용"];
  return [
    group.required ? "필수" : "선택",
    group.singleSelect ? "하나만" : "여러 개",
    group.selectAll ? "모두 선택 버튼" : null,
    group.dependsOnGroupName === null
      ? null
      : group.dependsOnOptionCode === null
        ? `선행 ${group.dependsOnGroupName}`
        : `선행 ${group.dependsOnGroupName} · ${group.dependsOnOptionCode}`,
  ].filter((trait): trait is string => trait !== null);
}

/**
 * 켤 수 있는지 판정은 `canSetProductActive` 하나다. 화면이 조건문을 직접 적지 않는다.
 * 사유를 버튼 옆에 글자로 적는다. `title` 만 두면 터치 기기에서 읽을 길이 없다.
 */
function ActivationButton({ product }: { product: ProductDesignRow }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const next = !product.isActive;
  const check = canSetProductActive(product, next);

  async function submit() {
    const summary = next
      ? `'${product.name}' 을 활성화합니다.\n\n고객 화면 맨 위 탭에 보이게 됩니다.\n활성 옵션 ${product.activeOptionCount}개.\n\n계속할까요?`
      : `'${product.name}' 을 비활성화합니다.\n\n고객 화면 탭에서 사라집니다. 이 상품의 단계·옵션·할인·묶음은 그대로 남고, 이미 발행된 견적에도 영향이 없습니다.\n다시 켤 수 있습니다.\n\n계속할까요?`;
    if (!window.confirm(summary)) return;

    setBusy(true);
    setError(null);
    try {
      await postJson("/api/admin/pricing", {
        kind: "set-product-active",
        productId: product.id,
        active: next,
      });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="design-activate">
      <button
        type="button"
        className={next ? "primary" : "ghost"}
        onClick={submit}
        disabled={!check.allowed || busy}
      >
        {next ? "활성화" : "비활성화"}
      </button>
      {!check.allowed && <p className="hint">{check.reason}</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

function NewProductForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nextCode = code.trim();
  const nextName = name.trim();
  const valid = CODE_PATTERN.test(nextCode) && nextName.length > 0;

  async function save() {
    const summary = `새 상품을 추가합니다.\n\n· 코드 ${nextCode} (나중에 바꿀 수 없습니다)\n· 이름 ${nextName}\n\n비활성 상태로 만들어집니다. 단계와 옵션을 등록한 뒤에 켜주세요.\n\n계속할까요?`;
    if (!window.confirm(summary)) return;

    setBusy(true);
    setError(null);
    try {
      await postJson("/api/admin/pricing", {
        kind: "create-product",
        code: nextCode,
        name: nextName,
      });
      setCode("");
      setName("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="new-option">
      <div className="new-option-field">
        <label htmlFor="new-product-code" className="field-label">
          코드
        </label>
        <input
          id="new-product-code"
          type="text"
          maxLength={40}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="JEONGSI"
          className="text-input code"
        />
      </div>

      <div className="new-option-field">
        <label htmlFor="new-product-name" className="field-label">
          이름
        </label>
        <input
          id="new-product-name"
          type="text"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="정시"
          className="text-input"
        />
      </div>

      <button
        type="button"
        className="primary"
        onClick={save}
        disabled={!valid || busy}
      >
        상품 추가
      </button>

      <p className="hint">
        코드는 대문자로 시작하고 대문자·숫자·밑줄만 쓸 수 있습니다. 나중에 바꿀
        수 없습니다. 이름은 고객 화면 탭에 그대로 보입니다. 새 상품은 맨 뒤에
        붙고 자리는 &lsquo;상품 탭 순서&rsquo;에서 옮깁니다.
      </p>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

function NewGroupForm({ products }: { products: ProductDesignRow[] }) {
  const router = useRouter();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [required, setRequired] = useState(false);
  const [singleSelect, setSingleSelect] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  const [noticeOnly, setNoticeOnly] = useState(false);
  const [dependsOnGroupId, setDependsOnGroupId] = useState("");
  const [dependsOnOptionCode, setDependsOnOptionCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const product = products.find((p) => p.id === productId);
  const prerequisite =
    product?.groups.find((g) => g.id === dependsOnGroupId) ?? null;

  const nextCode = code.trim();
  const nextName = name.trim();
  // 함께 켤 수 없는 조합. 서버의 `createGroupSchema` 와 같은 판정이다. (ADR-0043, ADR-0048)
  const conflict =
    selectAll && singleSelect
      ? "하나만 고르는 단계에는 모두 선택 버튼을 둘 수 없습니다."
      : noticeOnly && required
        ? "안내 전용 단계는 고를 것이 없어서 필수로 둘 수 없습니다."
        : noticeOnly && selectAll
          ? "안내 전용 단계에는 켤 옵션이 없어 모두 선택 버튼을 둘 수 없습니다."
          : null;
  const valid =
    product !== undefined &&
    CODE_PATTERN.test(nextCode) &&
    nextName.length > 0 &&
    conflict === null;

  function pickProduct(id: string) {
    setProductId(id);
    setDependsOnGroupId("");
    setDependsOnOptionCode("");
  }

  function pickPrerequisite(id: string) {
    setDependsOnGroupId(id);
    setDependsOnOptionCode("");
  }

  async function save() {
    if (!product) return;
    const traits = noticeOnly
      ? ["안내 전용 (고를 것 없음)"]
      : [
          required ? "필수" : "선택",
          singleSelect ? "하나만 고름" : "여러 개 고를 수 있음",
          selectAll ? "모두 선택 버튼 있음" : null,
        ].filter((trait) => trait !== null);
    const depends =
      prerequisite === null
        ? "· 선행 단계 없음"
        : dependsOnOptionCode === ""
          ? `· 선행 단계 ${prerequisite.name}`
          : `· 선행 단계 ${prerequisite.name} 의 ${dependsOnOptionCode} 옵션`;
    const summary = `'${product.name}' 에 새 단계를 추가합니다.\n\n· 코드 ${nextCode} (나중에 바꿀 수 없습니다)\n· 이름 ${nextName}\n· ${traits.join(", ")}\n${depends}\n\n맨 뒤에 붙습니다. 자리는 '표시 순서'에서 옮깁니다.\n\n계속할까요?`;
    if (!window.confirm(summary)) return;

    setBusy(true);
    setError(null);
    try {
      await postJson("/api/admin/pricing", {
        kind: "create-group",
        productId: product.id,
        code: nextCode,
        name: nextName,
        required,
        singleSelect,
        selectAll,
        noticeOnly,
        dependsOnGroupId: dependsOnGroupId === "" ? null : dependsOnGroupId,
        dependsOnOptionCode:
          dependsOnOptionCode === "" ? null : dependsOnOptionCode,
      });
      setCode("");
      setName("");
      setRequired(false);
      setSingleSelect(false);
      setSelectAll(false);
      setNoticeOnly(false);
      setDependsOnGroupId("");
      setDependsOnOptionCode("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  if (products.length === 0) {
    return <p className="empty-note">먼저 상품을 추가하세요.</p>;
  }

  return (
    <div className="new-option">
      <div className="new-option-field">
        <label htmlFor="new-group-product" className="field-label">
          상품
        </label>
        <select
          id="new-group-product"
          value={productId}
          onChange={(e) => pickProduct(e.target.value)}
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.isActive ? "" : " (꺼짐)"}
            </option>
          ))}
        </select>
      </div>

      <div className="new-option-field">
        <label htmlFor="new-group-code" className="field-label">
          코드
        </label>
        <input
          id="new-group-code"
          type="text"
          maxLength={40}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="STEP1"
          className="text-input code"
        />
      </div>

      <div className="new-option-field">
        <label htmlFor="new-group-name" className="field-label">
          이름
        </label>
        <input
          id="new-group-name"
          type="text"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="1단계 (60~80분)"
          className="text-input"
        />
      </div>

      <div className="new-option-field">
        <label htmlFor="new-group-depends" className="field-label">
          선행 단계
        </label>
        <select
          id="new-group-depends"
          value={dependsOnGroupId}
          onChange={(e) => pickPrerequisite(e.target.value)}
        >
          <option value="">없음</option>
          {/* 안내 전용 단계는 선택이 생길 수 없어서 고르면 영구히 잠긴다. (ADR-0048) */}
          {(product?.groups ?? [])
            .filter((g) => !g.noticeOnly)
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
        </select>
      </div>

      {prerequisite !== null && (
        <div className="new-option-field">
          <label htmlFor="new-group-depends-option" className="field-label">
            선행 옵션
          </label>
          <select
            id="new-group-depends-option"
            value={dependsOnOptionCode}
            onChange={(e) => setDependsOnOptionCode(e.target.value)}
          >
            <option value="">아무거나 하나</option>
            {prerequisite.optionCodes.map((optionCode) => (
              <option key={optionCode} value={optionCode}>
                {optionCode}
              </option>
            ))}
          </select>
        </div>
      )}

      <fieldset className="design-flags">
        <legend className="field-label">성질</legend>
        <label>
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          필수
        </label>
        <label>
          <input
            type="checkbox"
            checked={singleSelect}
            onChange={(e) => setSingleSelect(e.target.checked)}
          />
          하나만 고름
        </label>
        <label>
          <input
            type="checkbox"
            checked={selectAll}
            onChange={(e) => setSelectAll(e.target.checked)}
          />
          모두 선택 버튼
        </label>
        <label>
          <input
            type="checkbox"
            checked={noticeOnly}
            onChange={(e) => setNoticeOnly(e.target.checked)}
          />
          안내 전용
        </label>
      </fieldset>

      <button
        type="button"
        className="primary"
        onClick={save}
        disabled={!valid || busy}
      >
        단계 추가
      </button>

      <p className="hint">
        선행 단계를 고르면 고객이 그것을 선택할 때까지 이 단계가 잠깁니다. 선행
        옵션까지 고르면 그 옵션 하나로 좁혀집니다. 성질과 순서는 나중에 이
        화면에서 바꿀 수 없습니다. 순서만 &lsquo;표시 순서&rsquo;에서 옮깁니다.
      </p>
      <p className="hint">
        &lsquo;안내 전용&rsquo; 은 고를 것이 없는 단계입니다. 이름과 설명만
        보이고 금액에 들어가지 않습니다. 옵션을 넣을 수 없고 다른 단계의 선행
        단계로 고를 수 없습니다. 설명이 내용 전부이므로 만든 뒤에 &lsquo;설명
        문구&rsquo; 에서 채워 주세요. 비어 있으면 이름만 보입니다.
      </p>
      {conflict && <p className="form-error">{conflict}</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

export function ProductDesign({ products }: { products: ProductDesignRow[] }) {
  return (
    <section className="card">
      <h2>상품 설계</h2>
      <p className="hint">
        고객 화면 맨 위 탭을 만드는 자리입니다. 금액을 다루지 않으므로 적용 시작
        시각도 계산 미리보기도 없습니다. 새 상품은 <strong>비활성</strong>으로
        태어납니다. <strong>상품 추가 → 단계 추가 → 옵션 등록 → 활성화</strong>{" "}
        순서로 진행하세요. 상품과 단계는 지우지 못하고 비활성화만 할 수
        있습니다.
      </p>

      {products.length === 0 ? (
        <p className="empty-note">등록된 상품이 없습니다.</p>
      ) : (
        products.map((product) => (
          <article key={product.id} className="design-product">
            <div className="design-head">
              <div>
                <h3>
                  {product.name}{" "}
                  <span className="design-code">{product.code}</span>
                </h3>
                <p className="hint">
                  {product.isActive ? "활성" : "비활성"} · 단계{" "}
                  {product.groups.length}개 · 활성 옵션{" "}
                  {product.activeOptionCount}개
                </p>
              </div>
              <ActivationButton product={product} />
            </div>

            {product.groups.length === 0 ? (
              <p className="empty-note">단계가 없습니다.</p>
            ) : (
              <ul className="design-groups">
                {product.groups.map((group) => (
                  <li key={group.id}>
                    <strong>{group.name}</strong>{" "}
                    <span className="design-code">{group.code}</span>
                    <span className="hint">
                      {groupTraits(group).join(" · ")} · 옵션{" "}
                      {group.activeOptionCount}개
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))
      )}

      <h3>상품 추가</h3>
      <NewProductForm />

      <h3>단계 추가</h3>
      <NewGroupForm products={products} />
    </section>
  );
}
