import crypto from "crypto";

/**
 * Hashes a plaintext password using crypto.scryptSync with a cryptographically secure random salt.
 * Returns in format `salt:hash`.
 */
export function hashPassword(password: string): string {
  if (!password || typeof password !== "string") {
    throw new Error("Password must be a non-empty string");
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verifies a plaintext password against a stored `salt:hash` string using constant-time comparison.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash || typeof password !== "string" || typeof storedHash !== "string") {
    return false;
  }
  try {
    const parts = storedHash.split(":");
    if (parts.length !== 2) return false;
    const [salt, hash] = parts;
    if (!salt || !hash) return false;
    const expectedKey = Buffer.from(hash, "hex");
    const actualKey = crypto.scryptSync(password, salt, 64);
    if (expectedKey.length !== actualKey.length) return false;
    return crypto.timingSafeEqual(expectedKey, actualKey);
  } catch {
    return false;
  }
}

/**
 * Generates a cryptographically secure random reset token and expiration date.
 */
export function generatePasswordResetToken(expirationHours = 1): { token: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);
  return { token, expiresAt };
}
