import {
  bumpReauth,
  getReauthEpoch,
  reauthDelayMs,
  subscribeReauth,
} from "../convexReauth";

describe("reauthDelayMs", () => {
  test.each([
    [0, 1000],
    [1, 2000],
    [2, 4000],
    [3, 8000],
    [4, 16000],
    [5, 30000],
    [12, 30000],
  ])("attempt %i waits %i ms", (attempt, ms) => {
    expect(reauthDelayMs(attempt)).toBe(ms);
  });
});

describe("reauth epoch store", () => {
  test("bump increments the epoch and notifies subscribers", () => {
    const before = getReauthEpoch();
    const listener = jest.fn();
    const unsubscribe = subscribeReauth(listener);
    bumpReauth();
    expect(getReauthEpoch()).toBe(before + 1);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    bumpReauth();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
