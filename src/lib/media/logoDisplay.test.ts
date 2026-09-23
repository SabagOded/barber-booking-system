import { describe, expect, it } from "vitest";
import { customLogoDisplayClassName } from "./logoDisplay";

describe("public custom logo sizing", () => {
  it.each([
    ["small", "h-16 w-28"],
    ["medium", "h-24 w-40"],
    ["large", "h-32 w-56 max-w-[80vw]"],
  ] as const)("maps %s to a safe hero size", (size, expected) => {
    expect(customLogoDisplayClassName(size, "hero")).toBe(expected);
  });

  it.each([
    ["small", "h-6 w-12"],
    ["medium", "h-8 w-16"],
    ["large", "h-10 w-20"],
  ] as const)("maps %s to a safe booking-header size", (size, expected) => {
    expect(customLogoDisplayClassName(size, "header")).toBe(expected);
  });
});
