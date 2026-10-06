import { createHmac } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32(input) {
  if (typeof input !== "string") throw new Error("invalid base32 secret");
  const clean = input.toUpperCase().replace(/[\s=]/gu, "");
  if (clean.length < 2) throw new Error("invalid base32 secret");
  let bits = "";
  for (const character of clean) {
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Error("invalid base32 secret");
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8)
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

/** RFC 6238 TOTP (SHA-1, 30-second step, 6 digits), as authenticator apps compute it. */
export function totp(base32Secret, unixSeconds = Math.floor(Date.now() / 1000)) {
  if (!Number.isFinite(unixSeconds) || unixSeconds < 0)
    throw new Error("invalid timestamp");
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(unixSeconds / 30)));
  const digest = createHmac("sha1", decodeBase32(base32Secret))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}
