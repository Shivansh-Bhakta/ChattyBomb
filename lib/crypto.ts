import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env.ts";

const key = () => Buffer.from(env().ENCRYPTION_KEY, "base64");

/** AES-256-GCM. Output: "v1:" + base64(iv | tag | ciphertext). */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return "v1:" + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decrypt(payload: string): string {
  if (!payload.startsWith("v1:")) throw new Error("unknown ciphertext version");
  const buf = Buffer.from(payload.slice(3), "base64");
  if (buf.length < 29) throw new Error("ciphertext too short");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}
