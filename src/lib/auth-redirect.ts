export function safeAuthRedirect(value: string | null) {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  const localOrigin = "https://thinkova.test";
  const destination = new URL(value, localOrigin);
  return destination.origin === localOrigin ? value : null;
}
