import { describe, expect, it } from "vitest";
import { isFullName, MAX_CUSTOMER_NAME_LENGTH } from "./customerFields";

describe("customer full name", () => {
  it("accepts a normalized two-part name at the maximum length", () => {
    const name = `דוד ${"א".repeat(MAX_CUSTOMER_NAME_LENGTH - 4)}`;
    expect(isFullName(`  דוד   ${"א".repeat(MAX_CUSTOMER_NAME_LENGTH - 4)}  `)).toBe(true);
    expect(name.length).toBe(MAX_CUSTOMER_NAME_LENGTH);
  });

  it("rejects an oversized name while preserving the two-part and no-digit rules", () => {
    expect(isFullName(`דוד ${"א".repeat(MAX_CUSTOMER_NAME_LENGTH - 3)}`)).toBe(false);
    expect(isFullName("דוד")).toBe(false);
    expect(isFullName("דוד2 כהן")).toBe(false);
  });
});
