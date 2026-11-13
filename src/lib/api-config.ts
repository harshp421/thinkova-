/**
 * Central API configuration connecting frontend to the ThinkOva backend.
 */
export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://172.169.233.17:8000";

/**
 * Returns the fully-qualified API URL for a given endpoint path.
 * If running on client and path begins with /api, it routes via the backend or proxy.
 */
export function getApiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (typeof window !== "undefined") {
    // If backend URL is specified and different origin
    return `${BACKEND_URL}${normalized}`;
  }
  return `${BACKEND_URL}${normalized}`;
}
