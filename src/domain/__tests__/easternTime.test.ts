import {
  easternParts,
  formatEasternClock,
  nextEasternWallClock,
} from "../easternTime";

test("easternParts reads wall-clock fields in America/New_York", () => {
  // 2026-11-13T05:15:00Z is 00:15 EST
  expect(easternParts(Date.UTC(2026, 10, 13, 5, 15))).toMatchObject({
    year: 2026,
    month: 11,
    day: 13,
    hour: 0,
    minute: 15,
  });
});

test("formatEasternClock renders h:mm AM/PM", () => {
  // 15:00Z = 10:00 EST
  expect(formatEasternClock(Date.UTC(2026, 10, 13, 15, 0))).toBe("10:00 AM");
  // 02:05Z = 22:05 EDT (previous day)
  expect(formatEasternClock(Date.UTC(2026, 6, 1, 2, 5))).toBe("10:05 PM");
});

describe("nextEasternWallClock(from, 10)", () => {
  test.each([
    [
      "00:15 EST same day",
      Date.UTC(2026, 10, 13, 5, 15),
      Date.UTC(2026, 10, 13, 15, 0),
    ],
    [
      "21:05 EST next day",
      Date.UTC(2026, 10, 14, 2, 5),
      Date.UTC(2026, 10, 14, 15, 0),
    ],
    [
      "spring forward night 01:30 EST 2027-03-14",
      Date.UTC(2027, 2, 14, 6, 30),
      Date.UTC(2027, 2, 14, 14, 0), // 10:00 EDT = 14:00Z
    ],
    [
      "fall back night 01:30 EDT 2026-11-01",
      Date.UTC(2026, 10, 1, 5, 30),
      Date.UTC(2026, 10, 1, 15, 0), // 10:00 EST = 15:00Z
    ],
    [
      "exactly 10:00 goes to tomorrow",
      Date.UTC(2026, 10, 13, 15, 0),
      Date.UTC(2026, 10, 14, 15, 0),
    ],
  ])("%s", (_label, from, expected) => {
    expect(nextEasternWallClock(from, 10)).toBe(expected);
  });
});
