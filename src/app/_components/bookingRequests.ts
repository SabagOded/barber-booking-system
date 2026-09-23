export function createLatestRequest() {
  let generation = 0;

  return {
    invalidate() {
      generation++;
    },
    async run<T>(
      request: () => Promise<T>,
      handlers: { success: (value: T) => void; error: () => void; settled: () => void },
    ) {
      const current = ++generation;
      try {
        const value = await request();
        if (current === generation) handlers.success(value);
      } catch {
        if (current === generation) handlers.error();
      } finally {
        if (current === generation) handlers.settled();
      }
    },
  };
}

export function createBookingSubmission() {
  let generation = 0;
  let pending = false;

  return {
    isPending() {
      return pending;
    },
    invalidate() {
      generation++;
    },
    async submit<T>(
      request: () => Promise<T>,
      handlers: { success: (value: T) => void | Promise<void>; error: () => void },
    ): Promise<boolean> {
      if (pending) return false;
      pending = true;
      const current = ++generation;
      try {
        const value = await request();
        if (current === generation) await handlers.success(value);
      } catch {
        if (current === generation) handlers.error();
      } finally {
        pending = false;
      }
      return true;
    },
  };
}
