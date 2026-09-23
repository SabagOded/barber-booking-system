export const MAX_SOURCE_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_INPUT_PIXELS = 50_000_000;
export const IMAGE_TOO_LARGE_ERROR = "ניתן להעלות תמונה עד 15MB.";

export function clientImageSizeError(size: number): string | null {
  return size > MAX_SOURCE_IMAGE_BYTES ? IMAGE_TOO_LARGE_ERROR : null;
}
