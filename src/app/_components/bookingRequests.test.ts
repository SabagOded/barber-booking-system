import { describe, expect, it, vi } from "vitest";
import { createBookingSubmission, createLatestRequest } from "./bookingRequests";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("booking flow async requests", () => {
  it.each(["days", "slots"])("ignores obsolete %s results and loading completion", async () => {
    const gate = createLatestRequest();
    const older = deferred<string[]>();
    const newer = deferred<string[]>();
    const shown: string[][] = [];
    const loading = vi.fn();
    const handlers = { success: (value: string[]) => shown.push(value), error: vi.fn(), settled: loading };
    const first = gate.run(() => older.promise, handlers);
    const second = gate.run(() => newer.promise, handlers);

    older.resolve(["old"]);
    await first;
    expect(shown).toEqual([]);
    expect(loading).not.toHaveBeenCalled();

    newer.resolve(["new"]);
    await second;
    expect(shown).toEqual([["new"]]);
    expect(loading).toHaveBeenCalledTimes(1);

    const abandoned = deferred<string[]>();
    const third = gate.run(() => abandoned.promise, handlers);
    gate.invalidate(); // back/home invalidates the current request
    abandoned.reject(new Error("transport"));
    await third;
    expect(handlers.error).not.toHaveBeenCalled();
    expect(loading).toHaveBeenCalledTimes(1);
  });

  it("releases a rejected submission for retry and reports the generic error", async () => {
    const submission = createBookingSubmission();
    const failure = deferred<string>();
    const success = vi.fn();
    const error = vi.fn();
    const first = submission.submit(() => failure.promise, { success, error });
    expect(await submission.submit(async () => "duplicate", { success, error })).toBe(false);
    failure.reject(new Error("server transport"));
    expect(await first).toBe(true);
    expect(error).toHaveBeenCalledTimes(1);

    expect(await submission.submit(async () => "booked", { success, error })).toBe(true);
    expect(success).toHaveBeenCalledWith("booked");
  });

  it("ignores a booking completion after navigation/reset while retaining the pending lock", async () => {
    const submission = createBookingSubmission();
    const pending = deferred<string>();
    const success = vi.fn();
    const error = vi.fn();
    const first = submission.submit(() => pending.promise, { success, error });
    submission.invalidate();
    expect(await submission.submit(async () => "duplicate", { success, error })).toBe(false);
    pending.resolve("old booking");
    await first;
    expect(success).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(await submission.submit(async () => "new booking", { success, error })).toBe(true);
    expect(success).toHaveBeenCalledWith("new booking");
  });
});
