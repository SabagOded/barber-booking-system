import { describe, expect, it, vi } from "vitest";
import { focusWithoutScroll } from "./HoursDesk";

describe("special-hours focus restoration", () => {
  it("restores focus without moving the page after removing an exception", () => {
    const focus = vi.fn();

    focusWithoutScroll({ focus } as unknown as HTMLElement);

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});
