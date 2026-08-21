const encoder = new TextEncoder();

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function sha256Hex(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? encoder.encode(value) : Uint8Array.from(value);
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer)));
}

export async function sha256Base64(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? encoder.encode(value) : Uint8Array.from(value);
  return toBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer)));
}

export async function hmacSha256Hex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

export async function hmacSha256Base64(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

export function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

function randomBytes(size: number) {
  return crypto.getRandomValues(new Uint8Array(size));
}

export function generateOfferToken() {
  return toBase64(randomBytes(32))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function generatePublicReference() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  let suffix = "";
  for (const byte of bytes) suffix += alphabet[byte % alphabet.length];
  return `BW-${suffix}`;
}

export function generateProviderReference() {
  return `BW-${crypto.randomUUID().replaceAll("-", "").slice(0, 28)}`;
}
