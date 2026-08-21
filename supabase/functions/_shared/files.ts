import { ApiError } from "./http.ts";
import { sha256Hex } from "./crypto.ts";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
export const MAX_FILES = 5;

const mimeExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}

function detectMime(bytes: Uint8Array) {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return "image/webp";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  return null;
}

function safeName(name: string) {
  const cleaned = name
    .split(/[\\/]/)
    .at(-1)!
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return (cleaned || "attachment").slice(0, 255);
}

export async function validateFile(file: File) {
  if (file.size < 1 || file.size > MAX_FILE_BYTES) {
    throw new ApiError(400, "invalid_attachment_size", "Each attachment must be 5 MB or smaller.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = detectMime(bytes);
  if (!mimeType) {
    throw new ApiError(400, "invalid_attachment_type", "Attachments must be JPEG, PNG, WebP, or PDF files.");
  }

  return {
    bytes,
    mimeType,
    extension: mimeExtensions[mimeType],
    originalName: safeName(file.name),
    sizeBytes: file.size,
    sha256: await sha256Hex(bytes),
  };
}

export function validateFileBatch(files: File[]) {
  if (files.length > MAX_FILES) {
    throw new ApiError(400, "too_many_attachments", `Attach no more than ${MAX_FILES} files.`);
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_TOTAL_BYTES) {
    throw new ApiError(400, "attachments_too_large", "Attachments may total no more than 15 MB.");
  }
}
