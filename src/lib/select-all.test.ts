import { describe, expect, it } from "vitest";
import { allSelected, selectAllLabel, toggleAll } from "./select-all";

const STAGES = ["s1", "s2", "s3"];

describe("toggleAll", () => {
  it("아무것도 선택하지 않았으면 그룹 전체를 켠다", () => {
    expect(toggleAll(STAGES, [])).toEqual(["s1", "s2", "s3"]);
  });

  it("전부 켜져 있으면 전부 끈다", () => {
    expect(toggleAll(STAGES, ["s1", "s2", "s3"])).toEqual([]);
  });

  it("두 번 누르면 처음 상태로 돌아온다", () => {
    expect(toggleAll(STAGES, toggleAll(STAGES, []))).toEqual([]);
  });

  it("일부만 켜져 있으면 끄지 않고 나머지를 채운다", () => {
    expect(toggleAll(STAGES, ["s2"])).toEqual(["s2", "s1", "s3"]);
  });

  it("끌 때 다른 그룹의 선택은 건드리지 않는다", () => {
    expect(toggleAll(STAGES, ["other", "s1", "s2", "s3"])).toEqual(["other"]);
  });

  it("켤 때 다른 그룹의 선택을 지우지 않는다", () => {
    expect(toggleAll(STAGES, ["other"])).toEqual(["other", "s1", "s2", "s3"]);
  });

  it("옵션이 없는 그룹은 선택을 바꾸지 않는다", () => {
    expect(toggleAll([], ["other"])).toEqual(["other"]);
  });
});

describe("allSelected", () => {
  it("하나라도 빠지면 거짓이다", () => {
    expect(allSelected(STAGES, ["s1", "s3"])).toBe(false);
  });

  it("전부 들어 있으면 참이다", () => {
    expect(allSelected(STAGES, ["other", "s3", "s2", "s1"])).toBe(true);
  });

  it("옵션이 없는 그룹은 거짓이다", () => {
    expect(allSelected([], [])).toBe(false);
  });
});

describe("selectAllLabel", () => {
  it("전부 켜져 있지 않으면 '모두 선택' 이다", () => {
    expect(selectAllLabel("단계", STAGES, ["s1"])).toBe("단계 모두 선택");
  });

  it("전부 켜져 있으면 '모두 해제' 로 바뀐다", () => {
    expect(selectAllLabel("단계", STAGES, ["s1", "s2", "s3"])).toBe(
      "단계 모두 해제",
    );
  });

  it("개수를 적지 않고 그룹 이름에서 만든다", () => {
    expect(selectAllLabel("경쟁률 분석", ["a"], [])).toBe(
      "경쟁률 분석 모두 선택",
    );
  });
});
