import { parseRenewParams } from "@/src/parkeaz/renewFlow";

const ALLOWED_NOTIFICATION_ROUTES: readonly string[] = [
  "/(tabs)",
  "/extend-duration",
  "/confirm-stop",
  "/renew",
];

/**
 * Maps a push payload to the route to open, or null when the payload is
 * malformed, names a route outside the allowlist, or is a renew push
 * without a session id.
 */
export function routeForNotificationData(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const payload = data as Record<string, unknown>;
  const { route } = payload;
  if (typeof route !== "string") return null;
  if (!ALLOWED_NOTIFICATION_ROUTES.includes(route)) return null;
  if (route !== "/renew") return route;
  const sessionId = parseRenewParams(payload);
  return sessionId ? `/renew?sessionId=${encodeURIComponent(sessionId)}` : null;
}
