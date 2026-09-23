import { describe, expect, it } from "vitest";
import {
  clientImageSizeError,
  IMAGE_TOO_LARGE_ERROR,
  MAX_INPUT_PIXELS,
  MAX_SOURCE_IMAGE_BYTES,
} from "./limits";

describe("media upload limits", () => {
  it("keeps the decoded input ceiling at 50 million pixels", () => {
    expect(MAX_INPUT_PIXELS).toBe(50_000_000);
  });

  it("allows exactly 15 MiB and rejects the next byte on the client", () => {
    expect(clientImageSizeError(MAX_SOURCE_IMAGE_BYTES)).toBeNull();
    expect(clientImageSizeError(MAX_SOURCE_IMAGE_BYTES + 1)).toBe(IMAGE_TOO_LARGE_ERROR);
  });
});
