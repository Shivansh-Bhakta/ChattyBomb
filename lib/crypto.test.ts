import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto.ts";

describe("channel token encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("EAAG-token"), b = encrypt("EAAG-token");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("EAAG-token");
  });

  it("rejects tampered ciphertext", () => {
    const buf = Buffer.from(encrypt("secret").slice(3), "base64");
    buf[buf.length - 1] ^= 1;
    expect(() => decrypt("v1:" + buf.toString("base64"))).toThrow();
  });
});
