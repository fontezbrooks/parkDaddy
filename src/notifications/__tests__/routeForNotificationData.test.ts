import { routeForNotificationData } from "../routeForNotificationData";

describe("routeForNotificationData", () => {
  test.each(["/(tabs)", "/extend-duration", "/confirm-stop"])(
    "returns the bare allowed route %s",
    (route) => {
      expect(routeForNotificationData({ route, sessionId: "s1" })).toBe(route);
    },
  );

  test("returns the renew route with the session id", () => {
    expect(
      routeForNotificationData({ route: "/renew", sessionId: "abc123" }),
    ).toBe("/renew?sessionId=abc123");
  });

  test("encodes the session id", () => {
    expect(
      routeForNotificationData({ route: "/renew", sessionId: "a&b=c" }),
    ).toBe("/renew?sessionId=a%26b%3Dc");
  });

  test.each([
    { route: "/renew" },
    { route: "/renew", sessionId: "" },
    { route: "/renew", sessionId: 42 },
  ])("returns null for a renew push without a session id: %p", (data) => {
    expect(routeForNotificationData(data)).toBeNull();
  });

  test.each([
    { route: "/settings" },
    { route: "https://evil.example" },
    { route: "/renew/../settings", sessionId: "s1" },
  ])("returns null for a disallowed route: %p", (data) => {
    expect(routeForNotificationData(data)).toBeNull();
  });

  test.each([null, undefined, "/renew", 42, true, []])(
    "returns null for non-object input %p",
    (data) => {
      expect(routeForNotificationData(data)).toBeNull();
    },
  );

  test("returns null when route is missing or not a string", () => {
    expect(routeForNotificationData({})).toBeNull();
    expect(routeForNotificationData({ route: 7 })).toBeNull();
  });
});
