import { describe, expect, it } from "vitest";
import { formatPhone, maskEmail } from "./masking";

describe("이메일 마스킹", () => {
  it.each([
    ["minjun@example.com", "mi****@example.com"],
    ["ab@example.com", "a*@example.com"],
    ["a@example.com", "a*@example.com"],
  ])("%s → %s", (input, expected) => {
    expect(maskEmail(input)).toBe(expected);
  });

  it("골뱅이가 없으면 전부 가린다", () => {
    expect(maskEmail("not-an-email")).toBe("************");
  });
});

describe("휴대폰 표기", () => {
  it.each([
    ["01022223333", "010-2222-3333"],
    ["0102223333", "010-222-3333"],
  ])("%s → %s", (input, expected) => {
    expect(formatPhone(input)).toBe(expected);
  });
});
