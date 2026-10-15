// Одноразовые коды по времени (TOTP, RFC 6238): совместимы с Google Authenticator, 1Password и другими.
import { createHmac, randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function newSecret(): string {
  const bytes = randomBytes(20);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function decode(secret: string): Buffer {
  let bits = '';
  for (const ch of secret.replace(/=+$/, '').toUpperCase()) {
    const v = ALPHABET.indexOf(ch);
    if (v >= 0) bits += v.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function codeAt(secret: string, time: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const h = createHmac('sha1', decode(secret)).update(counter).digest();
  const off = h[h.length - 1]! & 0xf;
  const n = ((h[off]! & 0x7f) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(n % 1_000_000).padStart(6, '0');
}

/** Код принимается с допуском ±30 секунд на расхождение часов. */
export function verifyCode(secret: string, code: string, now: number): boolean {
  const clean = code.replace(/\s/g, '');
  return /^\d{6}$/.test(clean) && [-1, 0, 1].some((w) => codeAt(secret, now + w * 30000) === clean);
}

export const otpauthUrl = (secret: string, email: string) =>
  `otpauth://totp/qwerttclients:${encodeURIComponent(email)}?secret=${secret}&issuer=qwerttclients&digits=6&period=30`;
