import { describe, expect, it } from "vitest";
import { createGroupSchema } from "./admin";

/**
 * 단계 신설 입력에서 **함께 켤 수 없는 조합**만 본다. (ADR-0043, ADR-0044, ADR-0048)
 * 선행 그룹이 같은 상품인지 같은 관계 판정은 상품을 읽어야 알므로 Repository 쪽이다.
 */
function group(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    productId: "prod-1",
    code: "STEP1",
    name: "1단계",
    required: false,
    singleSelect: false,
    selectAll: false,
    noticeOnly: false,
    dependsOnGroupId: null,
    dependsOnOptionCode: null,
    ...overrides,
  };
}

describe("createGroupSchema", () => {
  it("기본 입력을 통과시킨다", () => {
    expect(createGroupSchema.safeParse(group()).success).toBe(true);
  });

  it("안내 전용 단계를 통과시킨다", () => {
    expect(
      createGroupSchema.safeParse(group({ noticeOnly: true })).success,
    ).toBe(true);
  });

  it("단일 선택과 전체 선택 버튼을 함께 켤 수 없다", () => {
    const parsed = createGroupSchema.safeParse(
      group({ singleSelect: true, selectAll: true }),
    );
    expect(parsed.success).toBe(false);
  });

  it("안내 전용 단계를 필수로 둘 수 없다", () => {
    const parsed = createGroupSchema.safeParse(
      group({ noticeOnly: true, required: true }),
    );
    expect(parsed.success).toBe(false);
  });

  it("안내 전용 단계에 전체 선택 버튼을 둘 수 없다", () => {
    const parsed = createGroupSchema.safeParse(
      group({ noticeOnly: true, selectAll: true }),
    );
    expect(parsed.success).toBe(false);
  });

  it("선행 그룹 없이 선행 옵션 코드만 넣을 수 없다", () => {
    const parsed = createGroupSchema.safeParse(
      group({ dependsOnOptionCode: "STAGE_6" }),
    );
    expect(parsed.success).toBe(false);
  });

  it("소문자 코드를 거부한다", () => {
    expect(createGroupSchema.safeParse(group({ code: "step1" })).success).toBe(
      false,
    );
  });
});
