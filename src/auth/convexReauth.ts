// Convex re-authentication after the client gives up.
//
// When a token refetch returns null (app resumed offline, Clerk session not
// yet refreshed) the Convex client clears auth and never retries on its
// own; ConvexProviderWithAuth only calls client.setAuth again when its
// fetchAccessToken identity changes. The epoch below is folded into that
// identity so a bump forces a fresh setAuth. The watchdog bumps on
// foreground and, while Clerk is signed in but Convex is not, on a capped
// backoff.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { AppState } from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { useConvexAuth } from "convex/react";
import * as Sentry from "@sentry/react-native";

const REAUTH_BASE_MS = 1000;
const REAUTH_MAX_MS = 30_000;
const REAUTH_WARN_ATTEMPT = 3;

export function reauthDelayMs(attempt: number): number {
  return Math.min(REAUTH_BASE_MS * 2 ** attempt, REAUTH_MAX_MS);
}

let epoch = 0;
const listeners = new Set<() => void>();

export function getReauthEpoch(): number {
  return epoch;
}

export function subscribeReauth(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function bumpReauth(): void {
  epoch += 1;
  for (const l of listeners) l();
}

type FetchArgs = { forceRefreshToken: boolean };

// Mirrors convex/react-clerk's useAuthFromClerk with the epoch added to the
// fetchAccessToken dependencies. getToken and sessionClaims are left out of
// the deps on purpose, as upstream does: they change identity per render.
export function useClerkAuthForConvex() {
  const {
    isLoaded,
    isSignedIn,
    getToken,
    orgId,
    orgRole,
    sessionId,
    sessionClaims,
  } = useAuth();
  const reauthEpoch = useSyncExternalStore(subscribeReauth, getReauthEpoch);
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: FetchArgs): Promise<string | null> => {
      try {
        if (sessionClaims?.aud === "convex") {
          return await getToken({ skipCache: forceRefreshToken });
        }
        return await getToken({
          template: "convex",
          skipCache: forceRefreshToken,
        });
      } catch {
        return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see note above
    [orgId, orgRole, sessionId, reauthEpoch],
  );
  return useMemo(
    () => ({
      isLoading: !isLoaded,
      isAuthenticated: isSignedIn ?? false,
      fetchAccessToken,
    }),
    [isLoaded, isSignedIn, fetchAccessToken],
  );
}

// Mount once inside ConvexProviderWithAuth.
export function ConvexAuthWatchdog(): null {
  const { isSignedIn } = useAuth();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const stuck = Boolean(isSignedIn) && !isLoading && !isAuthenticated;
  const stuckRef = useRef(stuck);
  stuckRef.current = stuck;
  const attemptRef = useRef(0);

  useEffect(() => {
    if (isAuthenticated) attemptRef.current = 0;
  }, [isAuthenticated]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !stuckRef.current) return;
      Sentry.addBreadcrumb({
        category: "auth",
        message: "convex_reauth",
        data: { trigger: "foreground" },
      });
      bumpReauth();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!stuck) return;
    const attempt = attemptRef.current;
    const id = setTimeout(() => {
      attemptRef.current = attempt + 1;
      Sentry.addBreadcrumb({
        category: "auth",
        message: "convex_reauth",
        data: { trigger: "backoff", attempt },
      });
      if (attempt === REAUTH_WARN_ATTEMPT) {
        Sentry.captureMessage("convex_auth_stuck", {
          level: "warning",
          extra: { attempt },
        });
      }
      bumpReauth();
    }, reauthDelayMs(attempt));
    return () => clearTimeout(id);
  }, [stuck]);

  return null;
}
