import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, generatePasswordResetToken } from "../backend/auth/crypto";
import { PreSchemaValidator } from "../backend/database/schema/validator";

describe("Authentication & Crypto Engine", () => {
  it("generates different salt hashes for identical passwords", () => {
    const pwd = "SecurePassword123!";
    const hash1 = hashPassword(pwd);
    const hash2 = hashPassword(pwd);

    expect(hash1).not.toBe(hash2);
    expect(hash1).toContain(":");
    expect(hash2).toContain(":");
  });

  it("verifies matching passwords correctly", () => {
    const pwd = "MyStrongPassword@2026";
    const hash = hashPassword(pwd);

    expect(verifyPassword(pwd, hash)).toBe(true);
  });

  it("rejects mismatched passwords and invalid hashes", () => {
    const pwd = "MyStrongPassword@2026";
    const hash = hashPassword(pwd);

    expect(verifyPassword("WrongPassword", hash)).toBe(false);
    expect(verifyPassword("", hash)).toBe(false);
    expect(verifyPassword(pwd, "invalid-hash")).toBe(false);
    expect(verifyPassword(pwd, "")).toBe(false);
  });

  it("generates a valid password reset token with 1 hour expiration", () => {
    const { token, expiresAt } = generatePasswordResetToken(1);

    expect(token).toBeDefined();
    expect(token.length).toBe(64); // 32 bytes hex
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 50 * 60 * 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 65 * 60 * 1000);
  });

  it("normalizes user entities while preserving passwordHash and reset tokens", () => {
    const rawUser = {
      id: "usr_test_123",
      email: "test.parent@thinkova.ai",
      username: "testparent",
      phone: "919876543210",
      role: "PARENT" as const,
      isPhoneVerified: true,
      isEmailVerified: true,
      passwordHash: "salt123:hash456",
      resetPasswordToken: "resettoken123",
      resetPasswordExpires: new Date(Date.now() + 3600000),
    };

    const normalized = PreSchemaValidator.normalizeUser(rawUser);

    expect(normalized.passwordHash).toBe("salt123:hash456");
    expect(normalized.resetPasswordToken).toBe("resettoken123");
    expect(normalized.resetPasswordExpires).toBeInstanceOf(Date);
  });
});
