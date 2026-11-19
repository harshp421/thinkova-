import { NextResponse } from "next/server";

export interface RateLimitRule {
  maxRequests: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTimeMs: number;
  retryAfterSeconds: number;
  clientIp: string;
}

/**
 * Route-specific rate limiting configurations
 */
export const RATE_LIMIT_RULES: Record<string, RateLimitRule> = {
  // Max 5 signup attempts per IP per minute (prevents automated bot registrations)
  "/api/auth/signup": {
    maxRequests: 5,
    windowSeconds: 60,
  },
  // Max 10 login attempts per IP per minute (prevents credential brute-forcing)
  "/api/auth/login": {
    maxRequests: 10,
    windowSeconds: 60,
  },
  // Max 10 order initiation calls per IP per minute (prevents card testing / carding fraud)
  "/api/cashfree/order": {
    maxRequests: 10,
    windowSeconds: 60,
  },
  // Max 3 school partnership lead inquiries per IP per minute (prevents CRM & email spam)
  "/api/school-pack": {
    maxRequests: 3,
    windowSeconds: 60,
  },
  // Max 10 event reminders and actions per IP per minute (prevents OpenWA WhatsApp & email quota exhaustion)
  "/api/events": {
    maxRequests: 10,
    windowSeconds: 60,
  },
};

/**
 * In-memory sliding window bucket store:
 * Key format: `${endpoint}:${clientIp}`
 * Value: array of timestamp millisecond numbers
 */
const rateLimitStore = new Map<string, number[]>();
let lastCleanupTime = Date.now();
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
const MAX_STORE_ENTRIES = 10000;

/**
 * Resolves the client IP address reliably.
 * Prioritizes Cloudflare CF-Connecting-IP (since ThinkOva is proxied via Cloudflare),
 * then X-Forwarded-For (first entry), X-Real-IP, and local fallback.
 */
export function getClientIp(headers: Headers): string {
  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "127.0.0.1";
}

/**
 * Housekeeping to prune stale IP entries from memory
 */
function cleanupExpiredEntries(now: number) {
  if (now - lastCleanupTime < CLEANUP_INTERVAL_MS && rateLimitStore.size < MAX_STORE_ENTRIES) {
    return;
  }
  lastCleanupTime = now;

  for (const [key, timestamps] of rateLimitStore.entries()) {
    // 5 minutes is the maximum window we retain
    const cutoff = now - 300 * 1000;
    const fresh = timestamps.filter((t) => t > cutoff);
    if (fresh.length === 0) {
      rateLimitStore.delete(key);
    } else {
      rateLimitStore.set(key, fresh);
    }
  }
}

/**
 * Evaluates whether an incoming request exceeds the configured rate limit rule.
 * Returns null if the route is not rate-limited.
 */
export function checkRateLimit(
  pathname: string,
  headers: Headers,
  customRule?: RateLimitRule
): RateLimitResult | null {
  // Match rule by exact route or prefix
  let rule = customRule;
  if (!rule) {
    for (const [routePrefix, configuredRule] of Object.entries(RATE_LIMIT_RULES)) {
      if (pathname === routePrefix || pathname.startsWith(`${routePrefix}/`)) {
        rule = configuredRule;
        break;
      }
    }
  }

  if (!rule) {
    return null; // Route is not rate-limited
  }

  const now = Date.now();
  cleanupExpiredEntries(now);

  const clientIp = getClientIp(headers);
  const key = `${pathname}:${clientIp}`;
  const windowStart = now - rule.windowSeconds * 1000;

  const existingTimestamps = rateLimitStore.get(key) || [];
  const currentWindowTimestamps = existingTimestamps.filter((t) => t > windowStart);

  if (currentWindowTimestamps.length >= rule.maxRequests) {
    const oldestTimestamp = currentWindowTimestamps[0] || now;
    const resetTimeMs = oldestTimestamp + rule.windowSeconds * 1000;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetTimeMs - now) / 1000));

    return {
      allowed: false,
      limit: rule.maxRequests,
      remaining: 0,
      resetTimeMs,
      retryAfterSeconds,
      clientIp,
    };
  }

  currentWindowTimestamps.push(now);
  rateLimitStore.set(key, currentWindowTimestamps);

  const remaining = Math.max(0, rule.maxRequests - currentWindowTimestamps.length);
  const resetTimeMs = now + rule.windowSeconds * 1000;

  return {
    allowed: true,
    limit: rule.maxRequests,
    remaining,
    resetTimeMs,
    retryAfterSeconds: 0,
    clientIp,
  };
}

/**
 * Creates standard HTTP 429 Too Many Requests response with standard rate limit headers
 */
export function createRateLimitExceededResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      error: "Too many requests. Please slow down and try again.",
      message: `Rate limit exceeded. Allowed ${result.limit} requests per window.`,
      retryAfter: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(result.resetTimeMs / 1000)),
      },
    }
  );
}

/**
 * Clears the rate limiter store (useful for tests)
 */
export function clearRateLimitStore() {
  rateLimitStore.clear();
}
