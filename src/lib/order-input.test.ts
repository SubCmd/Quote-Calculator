import { describe, expect, it } from "vitest";
import { resolveOrderInput } from "./order-input";

const entries = (...values: string[]) =>
  values.map((value, i) => ({ key: `k${i + 1}`, value }));

describe("resolveOrderInput", () => {
  it("번호 순으로 키를 줄 세운다", () => {
    const result = resolveOrderInput(entries("3", "1", "2"));
    expect(result.keys).toEqual(["k2", "k3", "k1"]);
    expect(result.error).toBeNull();
  });

  it("현재 순서를 그대로 적으면 그 순서를 돌려준다", () => {
    expect(resolveOrderInput(entries("1", "2", "3")).keys).toEqual([
      "k1",
      "k2",
      "k3",
    ]);
  });

  it("앞뒤 공백은 무시한다", () => {
    expect(resolveOrderInput(entries(" 2 ", "1")).keys).toEqual(["k2", "k1"]);
  });

  it("0 으로 시작하는 숫자도 받는다", () => {
    expect(resolveOrderInput(entries("02", "01")).keys).toEqual(["k2", "k1"]);
  });

  it("빈칸이 있으면 거부한다", () => {
    const result = resolveOrderInput(entries("1", "", "3"));
    expect(result.keys).toBeNull();
    expect(result.error).toBe("번호는 1부터 3 사이의 정수로 넣으세요.");
  });

  it("정수가 아니면 거부한다", () => {
    expect(resolveOrderInput(entries("1.5", "2")).keys).toBeNull();
    expect(resolveOrderInput(entries("-1", "2")).keys).toBeNull();
    expect(resolveOrderInput(entries("1a", "2")).keys).toBeNull();
  });

  it("0 은 거부한다", () => {
    expect(resolveOrderInput(entries("0", "1")).keys).toBeNull();
  });

  it("항목 수보다 큰 번호는 거부한다", () => {
    const result = resolveOrderInput(entries("1", "2", "4"));
    expect(result.keys).toBeNull();
    expect(result.error).toBe("번호는 1부터 3 사이의 정수로 넣으세요.");
  });

  it("번호가 겹치면 겹친 번호와 빠진 번호를 함께 알려준다", () => {
    const result = resolveOrderInput(entries("1", "1", "3"));
    expect(result.keys).toBeNull();
    expect(result.error).toBe("번호가 겹칩니다. 겹친 번호 1, 빠진 번호 2.");
  });

  it("세 줄이 같은 번호여도 가장 작은 빠진 번호를 알려준다", () => {
    const result = resolveOrderInput(entries("2", "2", "2"));
    expect(result.keys).toBeNull();
    expect(result.error).toBe("번호가 겹칩니다. 겹친 번호 2, 빠진 번호 1.");
  });

  it("항목이 하나면 1 만 받는다", () => {
    expect(resolveOrderInput(entries("1")).keys).toEqual(["k1"]);
    expect(resolveOrderInput(entries("2")).keys).toBeNull();
  });

  it("항목이 없으면 빈 순열이다", () => {
    expect(resolveOrderInput([]).keys).toEqual([]);
  });
});
