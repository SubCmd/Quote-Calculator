import { describe, expect, it } from "vitest";
import {
  allowedTransitions,
  canTransition,
  transitionError,
} from "./transition";

describe("상태 전이", () => {
  it("DRAFT 는 REQUESTED 로만 갈 수 있다", () => {
    expect(allowedTransitions("DRAFT")).toEqual(["REQUESTED"]);
  });

  it("REQUESTED 는 CONFIRMED 또는 CANCELED 로 갈 수 있다", () => {
    expect(allowedTransitions("REQUESTED")).toEqual(["CONFIRMED", "CANCELED"]);
  });

  it("CONFIRMED 는 종착 상태라 더 바꿀 수 없다", () => {
    expect(allowedTransitions("CONFIRMED")).toEqual([]);
    expect(canTransition("CONFIRMED", "CANCELED")).toBe(false);
  });

  it("CANCELED 는 되살릴 수 없다", () => {
    expect(canTransition("CANCELED", "REQUESTED")).toBe(false);
  });

  it("DRAFT 에서 CONFIRMED 로 건너뛸 수 없다", () => {
    expect(canTransition("DRAFT", "CONFIRMED")).toBe(false);
  });

  it("같은 상태로 다시 바꾸는 것도 허용하지 않는다", () => {
    expect(canTransition("REQUESTED", "REQUESTED")).toBe(false);
  });

  // EXPIRED 는 표시 상태일 뿐이다. 저장된 status 로 들어오면 안 된다. (ADR-0012)
  it("EXPIRED 는 출발점도 도착점도 될 수 없다", () => {
    expect(allowedTransitions("EXPIRED")).toEqual([]);
    expect(canTransition("REQUESTED", "EXPIRED")).toBe(false);
  });

  it("허용되는 전이에는 사유가 없다", () => {
    expect(transitionError("REQUESTED", "CONFIRMED")).toBeNull();
  });

  it("같은 상태면 이미 그 상태라고 알려준다", () => {
    expect(transitionError("REQUESTED", "REQUESTED")).toBe(
      "이미 '요청 접수' 상태입니다.",
    );
  });

  it("종착 상태면 더 바꿀 수 없다고 알려준다", () => {
    expect(transitionError("CONFIRMED", "CANCELED")).toBe(
      "'확정' 견적은 상태를 더 바꿀 수 없습니다.",
    );
  });

  it("경로가 없으면 출발·도착을 함께 알려준다", () => {
    expect(transitionError("DRAFT", "CONFIRMED")).toBe(
      "'작성 중' 에서 '확정' 로는 바꿀 수 없습니다.",
    );
  });
});
