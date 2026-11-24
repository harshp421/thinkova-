import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "thinkova_session";
const INSECURE_DEFAULT_SECRET = "thinkova_secure_parent_session_secret_key_2026";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * [SEC-02] Secure Session Secret Resolver
 * Strictly forbids using hardcoded fallback keys or weak secrets (< 32 characters) in production.
 */
export function getSessionSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.SESSION_SECRET;

  if (process.env.NODE_ENV === "production") {
    if (!secret || secret.trim().length < 32) {
      throw new Error(
        "[Security Critical] AUTH_SECRET environment variable is missing or shorter than 32 characters in production. Token generation and verification are refused."
      );
    }
    if (secret.trim() === INSECURE_DEFAULT_SECRET) {
      throw new Error(
        "[Security Critical] Known insecure default AUTH_SECRET detected in production. A unique cryptographically secure secret must be configured in environment variables."
      );
    }
    return secret.trim();
  }

  // Non-production fallback (development & testing)
  if (!secret) {
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        "[Security Warning] AUTH_SECRET not configured. Using development fallback key. Please configure a unique AUTH_SECRET (min 32 chars) in .env for production."
      );
    }
    return INSECURE_DEFAULT_SECRET;
  }

  return secret.trim();
}

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

function base64UrlEncode(str: string): string {
  return Buffer.from(str).toString("base64url");
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf-8");
}

/**
 * Creates a signed HMAC-SHA256 session token
 */
export async function createSessionToken(
  payload: Omit<AuthSessionPayload, "createdAt" | "expiresAt">
): Promise<string> {
  const secret = getSessionSecret();
  const now = Date.now();
  const fullPayload: AuthSessionPayload = {
    ...payload,
    createdAt: now,
    expiresAt: now + SESSION_MAX_AGE_SECONDS * 1000,
  };

  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${header}.${body}`;
  const signature = crypto.createHmac("sha256", secret).update(data).digest("base64url");

  return `${data}.${signature}`;
}

/**
 * Verifies and decodes an HMAC-SHA256 session token
 */
export async function verifySessionToken(token: string): Promise<AuthSessionPayload | null> {
  if (!token || typeof token !== "string") return null;

  let secret: string;
  try {
    secret = getSessionSecret();
  } catch (err) {
    console.error("[AuthSession] Token verification aborted:", err);
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;

  const [header, body, signature] = parts;
  const data = `${header}.${body}`;
  const expectedSignature = crypto.createHmac("sha256", secret).update(data).digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(body)) as AuthSessionPayload;
    if (payload.expiresAt && Date.now() > payload.expiresAt) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Reads the session token from Request cookies or Authorization header
 */
export async function getSessionFromRequest(
  request?: NextRequest
): Promise<AuthSessionPayload | null> {
  let token: string | undefined;

  if (request) {
    token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      const authHeader = request.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.slice(7).trim();
      }
    }
  } else {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    } catch {
      token = undefined;
    }
  }

  if (!token) return null;
  return await verifySessionToken(token);
}

/**
 * Attaches the session cookie to a Next.js response
 */
export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/**
 * Clears the session cookie on a Next.js response
 */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
