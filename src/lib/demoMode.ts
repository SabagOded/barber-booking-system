export const DEMO_MAX_APPOINTMENTS = 10;
export const DEMO_MAX_TIME_BLOCKS = 10;
export const DEMO_MAX_SERVICES = 6;
export const DEMO_MAX_EXCEPTION_DATES = 10;

export type DemoLimitResource = "appointments" | "timeBlocks" | "services";

export class DemoLimitError extends Error {
  constructor(public readonly resource: DemoLimitResource) {
    super(`Demo limit reached for ${resource}`);
    this.name = "DemoLimitError";
  }
}

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}
