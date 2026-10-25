// Shared by middleware (edge runtime) and server code.
export function authSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set in production");
  return new TextEncoder().encode(s || "dev-only-change-me-please-32-chars-min");
}
