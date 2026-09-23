export type FocalArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

export function clampFocalPosition(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

export function moveFocalPositionByArrow(
  focalX: number,
  focalY: number,
  key: FocalArrowKey,
  step: number,
): { focalX: number; focalY: number } {
  if (key === "ArrowLeft") {
    return { focalX: clampFocalPosition(focalX + step), focalY };
  }
  if (key === "ArrowRight") {
    return { focalX: clampFocalPosition(focalX - step), focalY };
  }
  if (key === "ArrowUp") {
    return { focalX, focalY: clampFocalPosition(focalY + step) };
  }
  return { focalX, focalY: clampFocalPosition(focalY - step) };
}
