import { describe, expect, it } from "vitest";
import { moveFocalPositionByArrow } from "./focalPosition";

describe("keyboard focal positioning", () => {
  it.each([
    ["ArrowLeft", { focalX: 52, focalY: 50 }],
    ["ArrowRight", { focalX: 48, focalY: 50 }],
    ["ArrowUp", { focalX: 50, focalY: 52 }],
    ["ArrowDown", { focalX: 50, focalY: 48 }],
  ] as const)("moves the visible image with %s in the same direction as panning", (key, expected) => {
    expect(moveFocalPositionByArrow(50, 50, key, 2)).toEqual(expected);
  });

  it("clamps keyboard movement to persisted focal bounds", () => {
    expect(moveFocalPositionByArrow(99, 1, "ArrowLeft", 10)).toEqual({
      focalX: 100,
      focalY: 1,
    });
    expect(moveFocalPositionByArrow(99, 1, "ArrowDown", 10)).toEqual({
      focalX: 99,
      focalY: 0,
    });
  });
});
