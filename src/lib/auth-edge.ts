/**
 * ThinkOva — Edge-Safe Authentication & Session Verification
 * Native Web Crypto API implementation for zero-dependency Edge Runtime verification.
 */

export const SESSION_COOKIE_NAME = "thinkova_session";
const SESSION_SECRET =
  process.env.AUTH_SECRET || "thinkova_secure_parent_session_secret_key_2026";

export interface AuthSessionPayload {
  userId: string;
  email: string;
  username: string;
  fullName: string;
  phone?: string;
  role: "PARENT" | "TUTOR" | "SCHOOL_ADMIN" | "SUPER_ADMIN";
  createdAt: number;
  expiresAt: number;
}

/**
 * Decodes base64url string to UTF-8 text safely across Edge and Node environments
 */
function decodeBase64Url(input: string): string {
  let base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  if (typeof atob === "function") {
    return decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  }
  return Buffer.from(base64, "base64").toString("utf-8");
}

/**
 * Converts ArrayBuffer to base64url string
 */
function bufferToBase64Url(buffer: ArrayBuffer): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(buffer).toString("base64url");
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Verifies and decodes an HMAC-SHA256 session token inside Next.js Edge Runtime
 */
export async function verifySessionTokenEdge(
  token: string,
  secretKey: string = SESSION_SECRET
): Promise<AuthSessionPayload | null> {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return null;
  }

  const [header, body, signature] = parts;
  const data = `${header}.${body}`;

  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      encoder.encode(data)
    );

    const expectedSignature = bufferToBase64Url(signatureBuffer);

    // Constant-time length & character check
    if (signature.length !== expectedSignature.length) {
      return null;
    }

    let mismatch = 0;
    for (let i = 0; i < signature.length; i++) {
      mismatch |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }
    if (mismatch !== 0) {
      return null;
    }

    const payload = JSON.parse(decodeBase64Url(body)) as AuthSessionPayload;

    if (payload.expiresAt && Date.now() > payload.expiresAt) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
