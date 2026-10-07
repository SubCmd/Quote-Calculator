import { describe, expect, it } from "vitest";
import { formatPhone, maskEmail, maskName, maskPhone } from "./masking";

describe("이름 마스킹", () => {
  it.each([
    ["김민준", "김*준"],
    ["김민준아", "김**아"],
    ["김민", "김*"],
    ["김", "김"],
  ])("%s → %s", (input, expected) => {
    expect(maskName(input)).toBe(expected);
  });

  it("값이 없으면 줄표를 보여준다", () => {
    expect(maskName(null)).toBe("—");
  });
});

describe("휴대폰 마스킹", () => {
  it.each([
    ["01022223333", "010-****-3333"],
    ["010-2222-3333", "010-****-3333"],
    ["0102223333", "010-****-3333"],
  ])("%s → %s", (input, expected) => {
    expect(maskPhone(input)).toBe(expected);
  });

  // 형식이 예상과 다르면 원본을 흘리지 않고 전부 가린다.
  it("자릿수가 모자라면 전부 가린다", () => {
    expect(maskPhone("12345")).toBe("*****");
  });
});

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
