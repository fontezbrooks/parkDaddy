import { resolveAuthGate } from "../authGate";

const base = {
  clerkLoaded: true,
  isSignedIn: true,
  convexLoading: false,
  convexAuthenticated: true,
  profile: { _id: "u1" } as unknown,
};

describe("resolveAuthGate", () => {
  test.each([
    ["clerk still loading", { clerkLoaded: false }, "loading"],
    [
      "signed out",
      { isSignedIn: false, convexAuthenticated: false },
      "signed-out",
    ],
    ["convex auth loading", { convexLoading: true }, "loading"],
    [
      "clerk signed in but convex not authenticated (resume after background)",
      { convexAuthenticated: false, profile: null },
      "loading",
    ],
    ["profile query pending", { profile: undefined }, "loading"],
    ["authenticated with no profile", { profile: null }, "needs-profile"],
    ["authenticated with profile", {}, "ready"],
  ])("%s", (_label, patch, expected) => {
    expect(resolveAuthGate({ ...base, ...patch })).toBe(expected);
  });
});
