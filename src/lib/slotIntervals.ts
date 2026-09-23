export const SLOT_INTERVAL_OPTIONS = [20, 30, 60] as const;

export type SlotIntervalOption = (typeof SLOT_INTERVAL_OPTIONS)[number];

export function isSlotIntervalOption(value: number): value is SlotIntervalOption {
  return SLOT_INTERVAL_OPTIONS.some((option) => option === value);
}
