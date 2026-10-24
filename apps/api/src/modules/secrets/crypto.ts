import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface Keyring {
  current: number;
  keys: Map<number, Buffer>;
}

export interface Sealed {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: number;
}

export class SecretError extends Error {
  constructor(message: string) {
    super(message); // never include plaintext or key material here
    this.name = "SecretError";
  }
}

/**
 * AES-256-GCM. `aad` (we use "<tenantId>:<kind>") is authenticated but not stored: a ciphertext
 * copied into another tenant's row or another secret kind fails to decrypt.
 */
export function seal(plaintext: string, keyring: Keyring, aad: string): Sealed {
  const key = keyring.keys.get(keyring.current);
  if (!key) throw new SecretError(`no key for current version ${keyring.current}`);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion: keyring.current };
}

export function open(s: Sealed, keyring: Keyring, aad: string): string {
  const key = keyring.keys.get(s.keyVersion);
  if (!key)
    throw new SecretError(
      `no key available for key_version ${s.keyVersion} (retired key missing from MASTER_KEY_PREVIOUS?)`,
    );
  try {
    const d = createDecipheriv("aes-256-gcm", key, s.iv);
    d.setAAD(Buffer.from(aad, "utf8"));
    d.setAuthTag(s.authTag);
    return Buffer.concat([d.update(s.ciphertext), d.final()]).toString("utf8");
  } catch {
    // Deliberately vague: don't reveal whether key, tag, AAD or ciphertext was wrong.
    throw new SecretError(
      "secret could not be decrypted (tampered, wrong key, or wrong tenant/kind)",
    );
  }
}
