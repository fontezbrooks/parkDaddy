// One decision for both route groups: what the user should see given Clerk,
// Convex auth, and the profile query. Convex can drop to unauthenticated
// while Clerk still says signed in (token refetch failed after a long
// background); in that window the profile query is skipped and we wait
// rather than mistaking "no identity" for "no profile".

export type AuthGate = "loading" | "signed-out" | "needs-profile" | "ready";

export type AuthGateInput = {
  clerkLoaded: boolean;
  isSignedIn: boolean;
  convexLoading: boolean;
  convexAuthenticated: boolean;
  profile: unknown; // undefined = query pending, null = no row
};

export function resolveAuthGate(s: AuthGateInput): AuthGate {
  if (!s.clerkLoaded) return "loading";
  if (!s.isSignedIn) return "signed-out";
  if (s.convexLoading || !s.convexAuthenticated) return "loading";
  if (s.profile === undefined) return "loading";
  return s.profile === null ? "needs-profile" : "ready";
}
