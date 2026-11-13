import {
  deriveSessionState,
  computeDueAt,
  shouldSendDuePush,
  shouldMarkLapsed,
  isDuplicateRegistration,
  normalizePlate,
  normalizeGuestCode,
  coverageEndFor,
  digitsOnly,
  planRegistrationPushes,
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

describe("digitsOnly", () => {
  test("keeps every digit, including the country code", () => {
    expect(digitsOnly("+1 (404) 555-0199")).toBe("14045550199");
  });
  test("leaves a digits-only number unchanged", () => {
    expect(digitsOnly("4045550199")).toBe("4045550199");
  });
  test("returns an empty string when there are no digits", () => {
    expect(digitsOnly("")).toBe("");
    expect(digitsOnly("n/a")).toBe("");
  });
});


describe("planRegistrationPushes", () => {
  const desiredEndTime = T0 + 24 * 3600_000;
  const parkEnd = T0 + REGISTRATION_MS;
  const fresh = { desiredEndTime, now: null, existing: {} };

  test("schedules both inside the session", () => {
    expect(planRegistrationPushes({ ...fresh, parkEnd })).toEqual({
      due: parkEnd - DUE_BUFFER_MS,
      lapse: parkEnd,
    });
  });
  test("skips due when computeDueAt(parkEnd) >= desiredEndTime", () => {
    const end = desiredEndTime + DUE_BUFFER_MS;
    expect(planRegistrationPushes({ ...fresh, parkEnd: end })).toEqual({
      due: null,
      lapse: null,
    });
    const atEdge = planRegistrationPushes({
      ...fresh,
      parkEnd: desiredEndTime + DUE_BUFFER_MS - 1,
    });
    expect(atEdge.due).toBe(desiredEndTime - 1);
  });
  test("skips lapse when parkEnd >= desiredEndTime but keeps due", () => {
    expect(
      planRegistrationPushes({ ...fresh, parkEnd: desiredEndTime }),
    ).toEqual({ due: desiredEndTime - DUE_BUFFER_MS, lapse: null });
  });
  test("does not re-create pushes that already exist", () => {
    expect(
      planRegistrationPushes({
        ...fresh,
        parkEnd,
        existing: { duePushId: true, lapsePushId: true },
      }),
    ).toEqual({ due: null, lapse: null });
    expect(
      planRegistrationPushes({
        ...fresh,
        parkEnd,
        existing: { duePushId: true },
      }),
    ).toEqual({ due: null, lapse: parkEnd });
  });
  test("with now, skips times at or before it", () => {
    const now = parkEnd - DUE_BUFFER_MS;
    expect(planRegistrationPushes({ ...fresh, parkEnd, now })).toEqual({
      due: null,
      lapse: parkEnd,
    });
    expect(planRegistrationPushes({ ...fresh, parkEnd, now: parkEnd })).toEqual(
      { due: null, lapse: null },
    );
  });
  test("a fresh registration (now null) still schedules elapsed times", () => {
    const pastEnd = T0 - 1;
    expect(planRegistrationPushes({ ...fresh, parkEnd: pastEnd })).toEqual({
      due: pastEnd - DUE_BUFFER_MS,
      lapse: pastEnd,
    });
  });
});
