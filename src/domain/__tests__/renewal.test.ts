import {
  deriveSessionState,
  computeDueAt,
  shouldSendDuePush,
  shouldMarkLapsed,
  isDuplicateRegistration,
  normalizePlate,
  normalizeGuestCode,
  coverageEndFor,
  DUE_BUFFER_MS,
  REGISTRATION_MS,
} from "../renewal";

const T0 = 1_800_000_000_000;
const base = { status: "active", desiredEndTime: T0 + 24 * 3600_000 };

describe("deriveSessionState", () => {
  test("active with no registration yet is awaiting_first", () => {
    expect(deriveSessionState(base, T0)).toEqual({ kind: "awaiting_first" });
  });
  test("before dueAt is registered until lastParkEnd", () => {
    const s = {
      ...base,
      lastParkEnd: T0 + REGISTRATION_MS,
      dueAt: T0 + REGISTRATION_MS - DUE_BUFFER_MS,
    };
    expect(deriveSessionState(s, T0 + 1)).toEqual({
      kind: "registered",
      until: s.lastParkEnd,
    });
  });
  test("at exactly dueAt is due", () => {
    const s = {
      ...base,
      lastParkEnd: T0 + REGISTRATION_MS,
      dueAt: T0 + REGISTRATION_MS - DUE_BUFFER_MS,
    };
    expect(deriveSessionState(s, s.dueAt)).toEqual({
      kind: "due",
      until: s.lastParkEnd,
    });
  });
  test("at exactly lastParkEnd with lapsedAt set is unregistered since lastParkEnd", () => {
    const s = {
      ...base,
      lastParkEnd: T0,
      lapsedAt: T0,
      dueAt: T0 - DUE_BUFFER_MS,
    };
    expect(deriveSessionState(s, T0)).toEqual({
      kind: "unregistered",
      since: T0,
    });
  });
  test("past lastParkEnd without lapsedAt (push not yet processed) is still unregistered since lastParkEnd", () => {
    const s = { ...base, lastParkEnd: T0, dueAt: T0 - DUE_BUFFER_MS };
    expect(deriveSessionState(s, T0 + 5_000)).toEqual({
      kind: "unregistered",
      since: T0,
    });
  });
  test("completed is done regardless of times", () => {
    expect(deriveSessionState({ ...base, status: "completed" }, T0)).toEqual({
      kind: "done",
    });
  });
  test("cancelled is done", () => {
    expect(deriveSessionState({ ...base, status: "cancelled" }, T0)).toEqual({
      kind: "done",
    });
  });
  test("legacy statuses renewing and failed behave as active", () => {
    expect(deriveSessionState({ ...base, status: "renewing" }, T0)).toEqual({
      kind: "awaiting_first",
    });
    expect(deriveSessionState({ ...base, status: "failed" }, T0)).toEqual({
      kind: "awaiting_first",
    });
  });
});

test("computeDueAt is parkEnd minus 10 minutes", () => {
  expect(computeDueAt(T0)).toBe(T0 - 10 * 60_000);
});

describe("shouldSendDuePush", () => {
  const s = { ...base, lastParkEnd: T0 };
  test("true when active and lastParkEnd matches the scheduled registration", () => {
    expect(shouldSendDuePush(s, T0)).toBe(true);
  });
  test("false when a newer registration replaced the scheduled one", () => {
    expect(
      shouldSendDuePush({ ...s, lastParkEnd: T0 + REGISTRATION_MS }, T0),
    ).toBe(false);
  });
  test.each(["cancelled", "completed"])("false when status is %s", (status) => {
    expect(shouldSendDuePush({ ...s, status }, T0)).toBe(false);
  });
});

describe("shouldMarkLapsed", () => {
  const s = { ...base, lastParkEnd: T0 };
  test("true at lastParkEnd with no newer registration and not yet lapsed", () => {
    expect(shouldMarkLapsed(s, T0, T0)).toBe(true);
  });
  test("false before the registration has ended", () => {
    expect(shouldMarkLapsed(s, T0, T0 - 1)).toBe(false);
  });
  test("false when already lapsed for this registration", () => {
    expect(shouldMarkLapsed({ ...s, lapsedAt: T0 }, T0, T0 + 1)).toBe(false);
  });
  test("false when a newer registration exists", () => {
    expect(
      shouldMarkLapsed({ ...s, lastParkEnd: T0 + REGISTRATION_MS }, T0, T0),
    ).toBe(false);
  });
  test("false when cancelled", () => {
    expect(shouldMarkLapsed({ ...s, status: "cancelled" }, T0, T0)).toBe(false);
  });
});

test("isDuplicateRegistration matches currentParkId exactly", () => {
  expect(
    isDuplicateRegistration({ ...base, currentParkId: "123456" }, "123456"),
  ).toBe(true);
  expect(
    isDuplicateRegistration({ ...base, currentParkId: "123456" }, "123457"),
  ).toBe(false);
  expect(isDuplicateRegistration(base, "123456")).toBe(false);
});

test("normalizePlate uppercases and strips spaces and dashes", () => {
  expect(normalizePlate(" abc-123 ")).toBe("ABC123");
});

describe("normalizeGuestCode", () => {
  test("accepts 4 to 12 alphanumerics, uppercased", () => {
    expect(normalizeGuestCode(" abcd12 ")).toBe("ABCD12");
  });
  test.each(["abc", "abcdefghijklm", "ab cd", ""])("rejects %p", (raw) => {
    expect(normalizeGuestCode(raw)).toBeNull();
  });
});

describe.each(["renewing", "failed"])("legacy status %s is live", (status) => {
  const s = { ...base, status, lastParkEnd: T0 };
  test("shouldSendDuePush is true when lastParkEnd matches", () => {
    expect(shouldSendDuePush(s, T0)).toBe(true);
  });
  test("shouldMarkLapsed is true at lastParkEnd with no lapsedAt", () => {
    expect(shouldMarkLapsed(s, T0, T0)).toBe(true);
  });
});

describe("coverageEndFor", () => {
  test("passes a normal desiredEndTime through", () => {
    expect(
      coverageEndFor({
        desiredEndTime: 500,
        lastParkEnd: 300,
        _creationTime: 100,
      }),
    ).toBe(500);
  });
  test("uses lastParkEnd for the legacy sentinel", () => {
    expect(
      coverageEndFor({
        desiredEndTime: Number.MAX_SAFE_INTEGER,
        lastParkEnd: 300,
        _creationTime: 100,
      }),
    ).toBe(300);
  });
  test("falls back to _creationTime for the sentinel without lastParkEnd", () => {
    expect(
      coverageEndFor({
        desiredEndTime: Number.MAX_SAFE_INTEGER,
        _creationTime: 100,
      }),
    ).toBe(100);
  });
});
