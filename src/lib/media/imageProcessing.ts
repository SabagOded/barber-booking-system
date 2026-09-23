import sharp from "sharp";
import {
  IMAGE_TOO_LARGE_ERROR,
  MAX_INPUT_PIXELS,
  MAX_SOURCE_IMAGE_BYTES,
} from "./limits";

export { MAX_SOURCE_IMAGE_BYTES } from "./limits";

const DECODED_FORMAT_BY_MIME = {
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/pjpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export const ACCEPTED_IMAGE_TYPES = new Set(Object.keys(DECODED_FORMAT_BY_MIME));

export type UploadFile = {
  size: number;
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export class ImageValidationError extends Error {}

export async function optimizeUploadedImage(
  value: unknown,
  kind: "logo" | "portfolio",
): Promise<Uint8Array> {
  if (!isUploadFile(value) || value.size === 0) {
    throw new ImageValidationError("נא לבחור קובץ תמונה.");
  }
  if (value.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new ImageValidationError(IMAGE_TOO_LARGE_ERROR);
  }
  const expectedFormat = normalizeDecodedImageFormat(value.type);
  if (!expectedFormat) {
    throw new ImageValidationError("ניתן להעלות רק PNG, JPEG או WEBP.");
  }

  const source = Buffer.from(await value.arrayBuffer());
  try {
    const pipeline = sharp(source, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    });
    const metadata = await pipeline.metadata();
    if (metadata.format !== expectedFormat || !metadata.width || !metadata.height) {
      throw new ImageValidationError("קובץ התמונה אינו תקין.");
    }

    const maxDimension = kind === "logo" ? 1200 : 2000;
    return await pipeline
      .rotate()
      .resize(maxDimension, maxDimension, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
  } catch (error) {
    if (error instanceof ImageValidationError) {
      throw error;
    }
    throw new ImageValidationError("קובץ התמונה אינו תקין.");
  }
}

export function normalizeDecodedImageFormat(
  mimeType: string,
): (typeof DECODED_FORMAT_BY_MIME)[keyof typeof DECODED_FORMAT_BY_MIME] | null {
  const normalized = mimeType.trim().toLowerCase();
  return DECODED_FORMAT_BY_MIME[normalized as keyof typeof DECODED_FORMAT_BY_MIME] ?? null;
}

function isUploadFile(value: unknown): value is UploadFile {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as UploadFile).size === "number" &&
      typeof (value as UploadFile).type === "string" &&
      typeof (value as UploadFile).arrayBuffer === "function",
  );
}
