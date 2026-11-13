# Turnstile Auto-Submit and Variable Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After Cloudflare Turnstile passes on the user's device, the app submits the ParkEaz checkout form itself, and the recorded coverage end reflects the real product (2 h daytime, until 10:00 AM Eastern after 9 PM).

**Architecture:** Three pure layers already exist and stay: page scripts (`src/parkeaz/pages.ts`), the flow reducer (`src/parkeaz/renewFlow.ts`), and shared domain logic (`src/domain/renewal.ts`). This plan adds a checkout script that polls for the Turnstile token and clicks Register once, a `checkout_info` event carrying the page's advertised duration, a three-tier coverage-end resolver (page text, checkout duration, clock model), and widens the `parkEndSource` enum end to end. The Eastern-time helpers move from `pages.ts` into a new domain module so the clock model and the parser share them.

**Tech Stack:** TypeScript, React Native WebView (ES5 injected scripts), Jest with `jest-expo` and `jest-environment-jsdom`, Convex.

**Spec:** `.claude/plans/turnstile-autosubmit-variable-coverage-design.md`

**Branch:** `fix/guest-code-source` (PR #7). Commit on top of `040d757`.

## Global Constraints

- Injected scripts are ES5: no arrow functions, `const`/`let`, template literals, or optional chaining inside `SCRIPT_PRELUDE` or any `*_BODY`.
- Values enter scripts only through the single `__CONFIG__` substitution via `JSON.stringify` with a replacer function; never concatenate user values.
- The script never touches the Turnstile widget. It reads `input[name="cf-turnstile-response"]` and clicks the site's own Register control. Nothing else.
- Poll interval 250 ms. Timeout 90 s. Register-control discovery deadline 2 s. One click per page load, guarded by `window.__parkdaddySubmitted`.
- `MAX_COVERAGE_MS = 14 * 60 * 60 * 1000` (amended from 13 h in the final review: the overnight block is 14 h of real time on the DST fall-back night). `PARK_END_SLACK_MS = 15 * 60 * 1000`. `REGISTRATION_MS` stays `2 * 60 * 60 * 1000`.
- Overnight window: Eastern hour `>= 21` or `< 10` ends at the next 10:00 AM Eastern wall-clock, computed by walking the Eastern calendar date (DST-safe).
- `parkEndSource` values: `"page" | "checkout" | "model"`. `"fallback"` stays accepted by the Convex schema and the mutation validator for old rows and old clients; new code never emits it.
- Banner copy, exact: "Waiting for the human check…", "Registering…", "Tap Register To Park", "ParkEaz changed their page. Fill it in by hand.", suffix " · Covers until {time}" where `{time}` is Eastern `h:mm AM/PM`.
- App copy, exact: "every 2 hours, until 10 AM after 9 PM" replaces "every 2 hours" at the seven sites listed in Task 6.
- Breadcrumbs carry no token, plate, email, phone, or guest code.
- All tests run under both `TZ=UTC` and `TZ=America/New_York` (`npm test` is invoked twice in CI; see Task 6).
- `npx tsc --noEmit`, `npx eslint app src convex` (0 errors), `npx jest` must pass before every commit. The husky pre-commit `gitleaks` hook must pass; never `--no-verify`.

## Review Focus

1. **Double submit.** A late poll tick after the click, a re-injection on the same URL, or the foreground reload must not produce a second `/charge` POST. Test pinned in Task 2 (once-flag) and Task 3 (`autofill` after `submitted` is ignored).
2. **Token present, Register disabled, then enabled.** The script must keep polling rather than give up. Test pinned in Task 2.
3. **DST nights for the clock model.** 2027-03-14 01:30 EST (spring forward) and 2026-11-01 01:30 (fall back, ambiguous) must both resolve to 10:00 AM wall-clock that day. Test pinned in Task 1.
4. **Device time zone independence.** Any test that formats or parses Eastern time must pass under `TZ=UTC` and `TZ=America/New_York`. Enforced by CI in Task 6.
5. **Old clients and old rows.** A 3.3.0 dev build already in the field sends `parkEndSource: "fallback"`; the mutation and schema must keep accepting it. Test pinned in Task 4 (validator) and noted for the device checklist.

---

### Task 1: Eastern-time domain module and clock model

**Files:**
- Create: `src/domain/easternTime.ts`
- Create: `src/domain/__tests__/easternTime.test.ts`
- Modify: `src/domain/renewal.ts` (add `MAX_COVERAGE_MS`, `PARK_END_SLACK_MS`, `OVERNIGHT_START_HOUR`, `OVERNIGHT_END_HOUR`, `modelCoverageEnd`, `CoverageEndSource`)
- Modify: `src/domain/__tests__/renewal.test.ts`
- Modify: `src/parkeaz/pages.ts` (import the helpers; delete the local copies and local `PARK_END_SLACK_MS`)

**Interfaces:**
- Produces:
  - `getEasternOffsetMs(instantMs: number): number` (moved verbatim from `pages.ts`)
  - `easternWallClockToMs(wallAsUtcMs: number): number` (moved verbatim)
  - `easternParts(instantMs: number): { year: number; month: number; day: number; hour: number; minute: number; second: number }`
  - `formatEasternClock(instantMs: number): string` returning `h:mm AM/PM`, for example `"10:00 AM"`
  - `nextEasternWallClock(fromMs: number, hour: number): number` returning the next instant at `hour:00:00` Eastern strictly after `fromMs`
  - `modelCoverageEnd(now: number): number` in `renewal.ts`
  - `type CoverageEndSource = "page" | "checkout" | "model"` in `renewal.ts`
  - constants `MAX_COVERAGE_MS`, `PARK_END_SLACK_MS`, `OVERNIGHT_START_HOUR = 21`, `OVERNIGHT_END_HOUR = 10` in `renewal.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/__tests__/easternTime.test.ts
import {
  easternParts,
  formatEasternClock,
  nextEasternWallClock,
} from "../easternTime";

test("easternParts reads wall-clock fields in America/New_York", () => {
  // 2026-11-13T05:15:00Z is 00:15 EST
  expect(easternParts(Date.UTC(2026, 10, 13, 5, 15))).toMatchObject({
    year: 2026, month: 11, day: 13, hour: 0, minute: 15,
  });
});

test("formatEasternClock renders h:mm AM/PM", () => {
  expect(formatEasternClock(Date.UTC(2026, 10, 13, 15, 0))).toBe("10:00 AM"); // 15:00Z = 10:00 EST
  expect(formatEasternClock(Date.UTC(2026, 6, 1, 2, 5))).toBe("10:05 PM"); // 02:05Z = 22:05 EDT (previous day)
});

describe("nextEasternWallClock(from, 10)", () => {
  test.each([
    ["00:15 EST same day", Date.UTC(2026, 10, 13, 5, 15), Date.UTC(2026, 10, 13, 15, 0)],
    ["21:05 EST next day", Date.UTC(2026, 10, 14, 2, 5), Date.UTC(2026, 10, 14, 15, 0)],
    ["spring forward night 01:30 EST 2027-03-14", Date.UTC(2027, 2, 14, 6, 30), Date.UTC(2027, 2, 14, 14, 0)], // 10:00 EDT = 14:00Z
    ["fall back night 01:30 EDT 2026-11-01", Date.UTC(2026, 10, 1, 5, 30), Date.UTC(2026, 10, 1, 15, 0)], // 10:00 EST = 15:00Z
    ["exactly 10:00 goes to tomorrow", Date.UTC(2026, 10, 13, 15, 0), Date.UTC(2026, 10, 14, 15, 0)],
  ])("%s", (_label, from, expected) => {
    expect(nextEasternWallClock(from, 10)).toBe(expected);
  });
});
```

```ts
// append to src/domain/__tests__/renewal.test.ts
import { modelCoverageEnd, MAX_COVERAGE_MS } from "../renewal";

describe("modelCoverageEnd (Eastern)", () => {
  test.each([
    ["12:15 AM -> 10:00 AM same day", Date.UTC(2026, 10, 13, 5, 15), Date.UTC(2026, 10, 13, 15, 0)],
    ["9:05 PM -> 10:00 AM next day", Date.UTC(2026, 10, 14, 2, 5), Date.UTC(2026, 10, 14, 15, 0)],
    ["2:00 PM -> +2h", Date.UTC(2026, 10, 13, 19, 0), Date.UTC(2026, 10, 13, 21, 0)],
    ["8:59 PM -> +2h", Date.UTC(2026, 10, 14, 1, 59), Date.UTC(2026, 10, 14, 3, 59)],
    ["9:30 AM -> 10:00 AM (30 min)", Date.UTC(2026, 10, 13, 14, 30), Date.UTC(2026, 10, 13, 15, 0)],
  ])("%s", (_label, now, expected) => {
    expect(modelCoverageEnd(now)).toBe(expected);
  });
  test("never exceeds MAX_COVERAGE_MS", () => {
    const now = Date.UTC(2026, 10, 14, 2, 0); // 9:00 PM EST
    expect(modelCoverageEnd(now) - now).toBeLessThanOrEqual(MAX_COVERAGE_MS);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/domain -v`
Expected: FAIL with "Cannot find module '../easternTime'" and "modelCoverageEnd is not a function".

- [ ] **Step 3: Implement `src/domain/easternTime.ts`**

Move `getEasternOffsetMs` and `easternWallClockToMs` from `pages.ts` unchanged. Add `easternParts` (one `Intl.DateTimeFormat(..., { timeZone: "America/New_York", hourCycle: "h23", ... }).formatToParts` call), `formatEasternClock` (derive from `easternParts`; do not use a second `Intl` call with `hour12`, Hermes formats "AM"/"PM" inconsistently), and `nextEasternWallClock(fromMs, hour)`: take `easternParts(fromMs)`, build the candidate `Date.UTC(y, m-1, d, hour)` as a wall clock, convert with `easternWallClockToMs`; if the result is `<= fromMs`, repeat with `d + 1`.

- [ ] **Step 4: Implement the constants and `modelCoverageEnd` in `src/domain/renewal.ts`**

```ts
export function modelCoverageEnd(now: number): number {
  const { hour } = easternParts(now);
  const isOvernight = hour >= OVERNIGHT_START_HOUR || hour < OVERNIGHT_END_HOUR;
  return isOvernight ? nextEasternWallClock(now, OVERNIGHT_END_HOUR) : now + REGISTRATION_MS;
}
```

- [ ] **Step 5: Point `src/parkeaz/pages.ts` at the domain module**

Replace the local helper definitions and `PARK_END_SLACK_MS` with imports from `@/src/domain/easternTime` and `@/src/domain/renewal`. Behaviour unchanged in this task; the parser's bound changes in Task 2.

- [ ] **Step 6: Run the full suite under both zones**

Run: `TZ=UTC npx jest && TZ=America/New_York npx jest`
Expected: PASS, all suites.

- [ ] **Step 7: Commit**

```bash
git add src/domain/easternTime.ts src/domain/__tests__/easternTime.test.ts src/domain/renewal.ts src/domain/__tests__/renewal.test.ts src/parkeaz/pages.ts
git commit -m "feat(domain): eastern-time helpers and overnight coverage model"
```

---

### Task 2: Checkout page script, duration parser, three-tier park-end resolver

**Files:**
- Modify: `src/parkeaz/pages.ts`
- Modify: `src/parkeaz/__fixtures__/checkout.html` (synthetic update: drop the `g-recaptcha` class, add `<input type="hidden" name="cf-turnstile-response" value="">` and a `<p>Time: 9 hours 44 minutes</p>`; keep the "synthetic" header comment and add "Turnstile era, 2026-11-13")
- Modify: `src/parkeaz/__tests__/pages.test.ts`

**Interfaces:**
- Consumes: Task 1 constants and helpers.
- Produces:
  - `CHECKOUT_BODY` (internal) registered in `PAGE_BODIES.checkout`, so `buildInjection("checkout", values)` is no longer `null`.
  - Posted messages from checkout, in order: `{ type: "autofill", page: "checkout", result: "waiting" }` on load; optionally `{ type: "checkout_info", durationMs: number }`; then exactly one of `result: "submitted" | "timeout" | "skipped"`.
  - `type AutofillResult = "applied" | "skipped" | "waiting" | "submitted" | "timeout"` exported from `pages.ts`.
  - `parseCheckoutDuration(text: string): number | null` matching `/\bTime:\s*(?:(\d+)\s*hours?)?\s*(?:(\d+)\s*minutes?)?/i`, null when neither group matched.
  - `parsePageParkEnd(text: string, now: number, expectedEnd?: number | null): { parkEnd: number; source: CoverageEndSource }`.

- [ ] **Step 1: Write the failing tests**

Extend `runInjection` to accept `"checkout"` and to stub `HTMLElement.prototype.click` on the Register button with a `jest.fn()`. Use `jest.useFakeTimers()` for the checkout tests.

```ts
describe("buildInjection on /checkout (Turnstile)", () => {
  const html = fixture("checkout.html");
  const setToken = (v: string) => {
    (document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement).value = v;
  };
  const registerButton = () =>
    Array.from(document.querySelectorAll("button, input[type=submit]")).find((el) =>
      /register to park/i.test((el as HTMLElement).textContent ?? (el as HTMLInputElement).value ?? ""),
    ) as HTMLButtonElement;

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("posts waiting, then clicks Register exactly once when the token appears", () => {
    const posted = runInjection(html, "checkout");
    const click = jest.fn();
    registerButton().click = click;
    expect(posted[0]).toMatchObject({ type: "autofill", page: "checkout", result: "waiting" });
    jest.advanceTimersByTime(1000);
    expect(click).not.toHaveBeenCalled();
    setToken("tok_123");
    jest.advanceTimersByTime(250);
    expect(click).toHaveBeenCalledTimes(1);
    expect(posted.at(-1)).toMatchObject({ type: "autofill", page: "checkout", result: "submitted" });
    jest.advanceTimersByTime(5000);
    expect(click).toHaveBeenCalledTimes(1); // once-flag
  });

  test("keeps polling while Register is disabled, clicks once it is enabled", () => {
    const posted = runInjection(html, "checkout", () => { registerButton().disabled = true; });
    const click = jest.fn();
    registerButton().click = click;
    setToken("tok");
    jest.advanceTimersByTime(2000);
    expect(click).not.toHaveBeenCalled();
    registerButton().disabled = false;
    jest.advanceTimersByTime(250);
    expect(click).toHaveBeenCalledTimes(1);
    expect(posted.at(-1)).toMatchObject({ result: "submitted" });
  });

  test("posts timeout after 90 s without a token and stops polling", () => {
    const posted = runInjection(html, "checkout");
    jest.advanceTimersByTime(90_000);
    expect(posted.at(-1)).toMatchObject({ result: "timeout" });
    const count = posted.length;
    setToken("late");
    jest.advanceTimersByTime(2000);
    expect(posted.length).toBe(count); // no further messages, no click
  });

  test("posts skipped when no Register control exists within 2 s", () => {
    const posted = runInjection(html, "checkout", () => registerButton().remove());
    jest.advanceTimersByTime(2000);
    expect(posted.at(-1)).toMatchObject({ result: "skipped" });
  });

  test("posts checkout_info with the advertised duration", () => {
    const posted = runInjection(html, "checkout");
    expect(posted).toContainEqual({ type: "checkout_info", durationMs: (9 * 60 + 44) * 60 * 1000 });
  });

  test("never submits without a guest code", () => {
    const posted = runInjection(html, "checkout", undefined, { ...values, guestCode: "" });
    setToken("tok");
    jest.advanceTimersByTime(1000);
    expect(posted.at(-1)).toMatchObject({ result: "skipped" });
  });
});

describe("parseCheckoutDuration", () => {
  test.each([
    ["Time: 9 hours 44 minutes", (9 * 60 + 44) * 60_000],
    ["Time: 2 hours", 2 * 60 * 60_000],
    ["Time: 1 hour", 60 * 60_000],
    ["Time: 45 minutes", 45 * 60_000],
    ["Time: 1 hour 1 minute", 61 * 60_000],
    ["no time here", null],
  ])("%p -> %p", (text, expected) => {
    expect(parseCheckoutDuration(text)).toBe(expected);
  });
});

describe("parsePageParkEnd precedence", () => {
  const now = Date.UTC(2026, 10, 13, 5, 15); // 00:15 EST
  test("page text wins when within 13h15m", () => {
    const r = parsePageParkEnd("Parking valid until 2026-11-13 10:00:00", now, now + 60_000);
    expect(r).toEqual({ parkEnd: Date.UTC(2026, 10, 13, 15, 0), source: "page" });
  });
  test("page text beyond 13h15m is ignored; checkout duration used", () => {
    const r = parsePageParkEnd("Parking valid until 2026-11-14 10:00:00", now, now + 3_600_000);
    expect(r).toEqual({ parkEnd: now + 3_600_000, source: "checkout" });
  });
  test("no page text, no checkout: clock model (00:15 -> 10:00 AM)", () => {
    const r = parsePageParkEnd("Thank you", now);
    expect(r).toEqual({ parkEnd: Date.UTC(2026, 10, 13, 15, 0), source: "model" });
  });
  test("checkout expectedEnd in the past is ignored", () => {
    const r = parsePageParkEnd("Thank you", now, now - 1);
    expect(r.source).toBe("model");
  });
});
```

Also update the existing test "buildInjection returns null for checkout, success, other" to expect `null` only for `success` and `other`, and the existing "falls back to now + 2h when no time is present" to assert `source: "model"` with a daytime `now`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/parkeaz/__tests__/pages.test.ts -v`
Expected: FAIL (checkout body missing, `parseCheckoutDuration` undefined, old source values).

- [ ] **Step 3: Implement `CHECKOUT_BODY` in `pages.ts`**

ES5. Outline: `if (!V.guestCode) { post("skipped"); return; }`; `post("waiting")`; parse `document.body.innerText` for the duration and post `checkout_info` if found (via a second `postRaw(obj)` helper in the prelude that stringifies any object); define `findRegister()` scanning `button, input[type=submit]` for `/register to park/i` in `textContent` or `value`; `var started = Date.now()`; `setInterval` at 250 ms: if `window.__parkdaddySubmitted` clear and return; if `Date.now() - started > 2000 && !findRegister()` post `"skipped"`, clear, return; if `Date.now() - started >= 90000` post `"timeout"`, clear, return; read the token input; if it exists, value non-empty, and the register control exists and is not `disabled`: set `window.__parkdaddySubmitted = true`, post `"submitted"`, clear the interval, `register.click()`.

- [ ] **Step 4: Implement `parseCheckoutDuration` and the new `parsePageParkEnd`**

`parsePageParkEnd`: compute `parkEnd` from text; if `now < parkEnd <= now + MAX_COVERAGE_MS + PARK_END_SLACK_MS` return `page`; else if `expectedEnd` is a finite number and `now < expectedEnd <= now + MAX_COVERAGE_MS + PARK_END_SLACK_MS` return `checkout`; else return `{ parkEnd: modelCoverageEnd(now), source: "model" }`.

- [ ] **Step 5: Run tests under both zones**

Run: `TZ=UTC npx jest src/parkeaz && TZ=America/New_York npx jest src/parkeaz`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/parkeaz/pages.ts src/parkeaz/__fixtures__/checkout.html src/parkeaz/__tests__/pages.test.ts
git commit -m "feat(parkeaz): auto-submit checkout after Turnstile, parse advertised duration, three-tier park end"
```

---

### Task 3: Flow reducer, banner copy, message parsing, origin allowlist

**Files:**
- Modify: `src/parkeaz/renewFlow.ts`
- Modify: `src/parkeaz/__tests__/renewFlow.test.ts`

**Interfaces:**
- Consumes: `AutofillResult`; `parsePageParkEnd(text, now, expectedEnd)`; `formatEasternClock`; `CoverageEndSource`.
- Produces:
  - `RenewFlowState` page step: `{ step: "page"; page: ParkEazPage; autofill: "pending" | AutofillResult; expectedEnd?: number }`
  - `Registration.parkEndSource: CoverageEndSource`
  - New event `{ type: "checkout_info"; durationMs: number; now: number }`
  - `parseWebViewMessage` accepts `checkout_info` with a finite positive `durationMs`, and all `AutofillResult` values.
  - `TOP_FRAME_ORIGINS` includes `"https://challenges.cloudflare.com"`.

- [ ] **Step 1: Write the failing tests**

```ts
test("checkout banner waits for the human check, then shows Registering", () => {
  let s = renewFlowReducer({ step: "loading" }, { type: "navigated", url: "https://paid.parkeaz.com/checkout" });
  expect(bannerText(s)).toBe("Waiting for the human check…");
  s = renewFlowReducer(s, { type: "autofill", page: "checkout", result: "waiting" });
  expect(bannerText(s)).toBe("Waiting for the human check…");
  s = renewFlowReducer(s, { type: "autofill", page: "checkout", result: "submitted" });
  expect(bannerText(s)).toBe("Registering…");
});

test("checkout timeout and skipped banners", () => {
  const base = renewFlowReducer({ step: "loading" }, { type: "navigated", url: "https://paid.parkeaz.com/checkout" });
  expect(bannerText(renewFlowReducer(base, { type: "autofill", page: "checkout", result: "timeout" }))).toBe("Tap Register To Park");
  expect(bannerText(renewFlowReducer(base, { type: "autofill", page: "checkout", result: "skipped" }))).toBe("ParkEaz changed their page. Fill it in by hand.");
});

test("checkout_info appends Covers until in Eastern time", () => {
  const now = Date.UTC(2026, 10, 13, 5, 15); // 00:15 EST
  let s = renewFlowReducer({ step: "loading" }, { type: "navigated", url: "https://paid.parkeaz.com/checkout" });
  s = renewFlowReducer(s, { type: "checkout_info", durationMs: (9 * 60 + 45) * 60_000, now });
  expect(bannerText(s)).toBe("Waiting for the human check… · Covers until 10:00 AM");
});

test("checkout_info is ignored off the checkout page", () => {
  const s = renewFlowReducer({ step: "loading" }, { type: "checkout_info", durationMs: 1, now: 0 });
  expect(s).toEqual({ step: "loading" });
});

test("success page uses checkout expectedEnd when its own text has no time", () => {
  const now = Date.UTC(2026, 10, 13, 5, 15);
  let s = renewFlowReducer({ step: "loading" }, { type: "navigated", url: "https://paid.parkeaz.com/checkout" });
  s = renewFlowReducer(s, { type: "checkout_info", durationMs: 3_600_000, now });
  s = renewFlowReducer(s, { type: "success_page", url: "https://paid.parkeaz.com/successful_transaction?parkid=9", text: "Thanks", now });
  expect(s).toMatchObject({ step: "saving", parkEnd: now + 3_600_000, parkEndSource: "checkout" });
});

test("success page with no sources uses the model", () => {
  const now = Date.UTC(2026, 10, 13, 19, 0); // 2 PM EST
  const s = renewFlowReducer({ step: "loading" }, { type: "success_page", url: "https://paid.parkeaz.com/successful_transaction?parkid=9", text: "Thanks", now });
  expect(s).toMatchObject({ step: "saving", parkEnd: now + 2 * 3_600_000, parkEndSource: "model" });
});

test("autofill events after submitted do not change state", () => {
  let s = renewFlowReducer({ step: "loading" }, { type: "navigated", url: "https://paid.parkeaz.com/checkout" });
  s = renewFlowReducer(s, { type: "autofill", page: "checkout", result: "submitted" });
  const again = renewFlowReducer(s, { type: "autofill", page: "checkout", result: "waiting" });
  expect(again).toBe(s);
});

describe("parseWebViewMessage additions", () => {
  test.each(["waiting", "submitted", "timeout"])("accepts autofill result %s", (result) => {
    expect(parseWebViewMessage(JSON.stringify({ type: "autofill", page: "checkout", result }), 1)).toEqual({ type: "autofill", page: "checkout", result });
  });
  test("accepts checkout_info with a positive finite durationMs", () => {
    expect(parseWebViewMessage(JSON.stringify({ type: "checkout_info", durationMs: 1200 }), 7)).toEqual({ type: "checkout_info", durationMs: 1200, now: 7 });
  });
  test.each([0, -1, "9", null, Infinity])("rejects checkout_info durationMs %p", (durationMs) => {
    expect(parseWebViewMessage(JSON.stringify({ type: "checkout_info", durationMs }), 7)).toBeNull();
  });
});

test("shouldLoadRequest allows challenges.cloudflare.com top-frame on iOS", () => {
  expect(shouldLoadRequest({ url: "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x", isTopFrame: true }, "ios")).toBe("allow");
});
```

Update the existing test "checkout banner tells the user to tap Register To Park" to the new "Waiting for the human check…" copy, and "success page without parkend uses fallback" to expect `parkEndSource: "model"`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/parkeaz/__tests__/renewFlow.test.ts -v`
Expected: FAIL on the new banner copy, `checkout_info`, and the Cloudflare origin.

- [ ] **Step 3: Implement**

- `onAutofill`: ignore when `state.autofill === "submitted"` (sticky). Preserve `expectedEnd` on the page state across autofill updates (`{ ...state, autofill: result }` already does).
- `onCheckoutInfo(state, event)`: only when `state.step === "page" && state.page === "checkout"`, return `{ ...state, expectedEnd: event.now + event.durationMs }`.
- `onSuccessPage`: read `expectedEnd` from the prior state when it was the checkout page; pass it as the third argument to `parsePageParkEnd`.
- `pageBannerText` for checkout per the Global Constraints copy, with the `" · Covers until " + formatEasternClock(expectedEnd)` suffix when present.
- `isAutofillResult` widened; `parseWebViewMessage` handles `checkout_info` (`typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs > 0`).
- Add `"https://challenges.cloudflare.com"` to `TOP_FRAME_ORIGINS`; update the comment to say Turnstile.

- [ ] **Step 4: Run tests under both zones**

Run: `TZ=UTC npx jest src/parkeaz && TZ=America/New_York npx jest src/parkeaz`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parkeaz/renewFlow.ts src/parkeaz/__tests__/renewFlow.test.ts
git commit -m "feat(renew): checkout wait/submit states, advertised coverage preview, Turnstile origin"
```

---

### Task 4: Convex validators and park-end bounds

**Files:**
- Modify: `convex/schema.ts` (`renewalLogs.parkEndSource` union)
- Modify: `convex/sessions.ts` (`recordRegistration` args and bounds)
- Run: `npx convex codegen` (dev deployment; regenerates `convex/_generated/api.d.ts`)

**Interfaces:**
- Consumes: `MAX_COVERAGE_MS`, `PARK_END_SLACK_MS` from `../src/domain/renewal`.
- Produces: `recordRegistration` accepts `parkEndSource: "page" | "checkout" | "model" | "fallback"` and rejects `parkEnd > parkStart + MAX_COVERAGE_MS + PARK_END_SLACK_MS` with `ConvexError({ code: "invalid_registration" })`.

- [ ] **Step 1: Write the failing check**

No convex-test harness exists (see the system analysis). The gate for this task is `npx tsc --noEmit` failing after Task 3 because the client now sends `"checkout" | "model"` to a validator that only accepts `"page" | "fallback"`.

Run: `npx tsc --noEmit`
Expected: FAIL with a type error at `src/hooks/useRenewFlow.ts` on `parkEndSource`.

- [ ] **Step 2: Implement**

```ts
// convex/schema.ts
parkEndSource: v.optional(
  v.union(v.literal("page"), v.literal("checkout"), v.literal("model"), v.literal("fallback")),
),
```

```ts
// convex/sessions.ts recordRegistration
parkEndSource: v.union(v.literal("page"), v.literal("checkout"), v.literal("model"), v.literal("fallback")),
...
const maxEnd = args.parkStart + MAX_COVERAGE_MS + PARK_END_SLACK_MS;
if (!args.parkId.trim() || args.parkEnd <= args.parkStart || args.parkEnd > maxEnd) {
  throw new ConvexError({ code: "invalid_registration", message: "Invalid registration" });
}
```

Then `npx convex codegen`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx jest`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/sessions.ts convex/_generated/api.d.ts
git commit -m "feat(convex): accept checkout/model park-end sources; bound parkEnd to 13h15m"
```

---

### Task 5: Hook telemetry

**Files:**
- Modify: `src/hooks/useRenewFlow.ts`

**Interfaces:**
- Consumes: `AutofillResult`, `CoverageEndSource`, `RenewFlowState.expectedEnd`.
- Produces: breadcrumb `renew_checkout` `{ submit: "auto" | "timeout" | "skipped", msToToken: number, durationParsed: boolean }`; `renew_result` data gains `parkEndSource` when the state carries it; `captureMessage("renew_parkend_fallback")` fires when `parkEndSource !== "page"` and carries `{ source }` as extra.

- [ ] **Step 1: Implement in `handleMessage` and `useRenewTelemetry`**

- In `handleMessage`, when `parsed.type === "autofill" && parsed.page === "checkout"`: track `checkoutLoadedAtRef` (set on the `"waiting"` result); on `"submitted" | "timeout" | "skipped"` add the `renew_checkout` breadcrumb with `submit` mapped (`submitted` to `auto`), `msToToken = Date.now() - checkoutLoadedAtRef`, and `durationParsed` from a ref set when a `checkout_info` message arrived. Keep the existing `renew_page` breadcrumb.
- In `useRenewTelemetry`, include `parkEndSource` in `renew_result` when `state.step` is `done` and the prior saving state is known (store it in a ref when `state.step === "saving"`); change the fallback warning condition to `state.parkEndSource !== "page"` and pass `{ extra: { source: state.parkEndSource } }`.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint src/hooks/useRenewFlow.ts && npx jest`
Expected: PASS, 0 lint errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useRenewFlow.ts
git commit -m "feat(renew): checkout submit breadcrumb and park-end source telemetry"
```

---

### Task 6: Copy, CI time zones, checklist

**Files:**
- Modify: `app/start-parking.tsx:116`, `app/extend-duration.tsx:111`, `app/(tabs)/index.tsx:96,123,175,246`, `app/(auth)/welcome.tsx:188`, `src/components/WhatsNewSheet.tsx:24`
- Modify: `.github/workflows/ci.yml`
- Modify: `.claude/plans/human-in-loop-renewal-device-checklist.md`

**Interfaces:** none.

- [ ] **Step 1: Copy**

Replace at each site so the sentence reads naturally with "every 2 hours, until 10 AM after 9 PM". Exact targets:
- start-parking: "ParkEaz needs a human check every 2 hours, until 10 AM after 9 PM. We'll ping you 10 …"
- extend-duration: "That adds 24 hours. You'll still tap to renew every 2 hours, until 10 AM after 9 PM."
- index.tsx:96: "… ParkEaz now requires a tap every 2 hours, until 10 AM after 9 PM. This session ends at …"
- index.tsx:123: "Add your plate and we'll ping you before each window ends."
- index.tsx:175 and :246: "24 hours · one tap every 2 hours, until 10 AM after 9 PM"
- welcome.tsx:188: "One tap. Every 2 hours, until 10 AM after 9 PM. Your guest stays parked, …"
- WhatsNewSheet: "ParkEaz added a human check. We'll ping you 10 minutes before each window ends; the app taps Register for you once the check passes."

- [ ] **Step 2: CI runs jest under two zones**

In `.github/workflows/ci.yml` replace the single `npx jest --ci` step with:

```yaml
      - run: TZ=UTC npx jest --ci
      - run: TZ=America/New_York npx jest --ci
```

- [ ] **Step 3: Checklist**

Append to the device checklist, under a new heading `## Turnstile and coverage (2026-11-13 spec)`, the spec's AC-1 to AC-8 with How/Result/Notes lines in the file's existing convention, plus one carry-forward: "Capture live `/checkout` and `/successful_transaction` (daytime and after 9 PM), scrub email/phone/plate/guest code, replace the synthetic fixtures, re-run `npx jest src/parkeaz`; confirm the Register control selector and the token input name against the live markup."

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx eslint app src convex && TZ=UTC npx jest && TZ=America/New_York npx jest`
Expected: all PASS, eslint 0 errors.

- [ ] **Step 5: Commit and push**

```bash
git add app src/components/WhatsNewSheet.tsx .github/workflows/ci.yml .claude/plans/human-in-loop-renewal-device-checklist.md
git commit -m "docs(copy): coverage copy, two-zone CI, Turnstile device checklist"
git push origin fix/guest-code-source
```

---

## After the plan

- `npx convex deploy` to production is a separate, user-approved step (prod already runs the branch's previous commit; this plan changes the `recordRegistration` validator additively and keeps `"fallback"` accepted, so the deploy order with the store build is free).
- Open question 1 from the spec (live checkout markup) is not blocking: the selector is text-based with a `skipped` fallback. The device run resolves it.
