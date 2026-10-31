# Human-in-the-Loop Renewal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ParkEaz guest-parking registration from an unattended Convex action into a foreground in-app WebView the user completes with one tap every 2 hours, and retire every server-side ParkEaz call.

**Architecture:** A shared pure domain module computes renewal times and the user-visible session state for both Convex and the app. Convex keeps the session document, schedules a "due" push 10 minutes before each 2-hour registration ends and a "lapsed" push when it ends, and completes the session at its 24-hour end. A new `app/renew.tsx` screen hosts a `react-native-webview` on ParkEaz's pages, injects autofill per page, detects the success page, and records the registration through a mutation.

**Tech Stack:** Expo 54, Expo Router, React Native 0.81, `react-native-webview`, Convex 1.34, Clerk, `@sentry/react-native` 7, Jest via `jest-expo` with `jest-environment-jsdom` for page-script tests.

**Spec:** `.claude/plans/human-in-loop-renewal-design.md`

## Global Constraints

- Daily mode only. `mode` stays in the schema as optional; `"extended"` is treated as daily on read (spec FR-1, FR-2).
- Every new schema field is `v.optional(...)` (spec §8; project memory: required fields fail deploy when existing docs lack them).
- Registration length 2 hours; due push at `lastParkEnd - 10 min`; lapse push at `lastParkEnd`; session length 24 hours; expiry warning 15 minutes before `desiredEndTime` (spec FR-4, FR-19, FR-20, FR-22).
- The WebView runs only in the foreground after a user action. The script never clicks "Register To Park" (spec NFR-3).
- No guest code, email, phone, or plate in Sentry breadcrumbs or logs. Breadcrumbs carry pathname and outcome only (spec NFR-4, NFR-6).
- No `console.log` in shipped code (project rule). Use Sentry breadcrumbs.
- Push copy verbatim from spec FR-19, FR-20: due title `Renew parking for {plate}`, body `Tap to keep {plate} registered. Takes one tap.`; lapse title `{plate} is unregistered`, body `Open parkDaddy to re-register.`
- Banner copy verbatim from spec §7 and FR-18.
- Version `3.3.0`, iOS `buildNumber` `20`, Android `versionCode` `4` (spec §11).
- Hard precondition before any `npx convex deploy` to production: Task 0 complete (spec FR-29).
- Commit after each task. Conventional commit messages. Do not bundle the pre-existing uncommitted work (`app.json` versionCode 3, `docs/` Play package, sign-in fix) into these commits; those are committed separately first (Task 0, step 1).

## Review Focus

Inputs the spec implies but no acceptance criterion exercises. Each has a test pinned to the task that owns the code.

1. **ParkEaz `parkend` is Eastern time with no zone suffix; the phone may be in another timezone.** Expected: the stored `parkEnd` is the same instant regardless of device zone. Test in Task 3 (`parsePageParkEnd` under `TZ=America/Los_Angeles`).
2. **Due push fires after the user already re-registered or cancelled.** Expected: no push. Test in Task 1 (`shouldSendDuePush`) and wired in Task 4.
3. **`recordRegistration` is called twice for the same `parkId`** (success page reloaded, mutation retried after a timeout). Expected: one log row, pushes scheduled once. Test in Task 1 (`isDuplicateRegistration`), wired in Task 4.
4. **Deep link `/renew?sessionId=<garbage or someone else's id>`.** Expected: redirect to Home, no crash, mutation refuses foreign sessions. Test in Task 5 (param parse) and Task 4 (ownership guard).
5. **Registered with ParkEaz but the save mutation fails (offline).** Expected: banner shows the confirmation id and a Retry that re-sends the same values. Test in Task 5 (`renewFlowReducer` `save_failed` state).

---

### Task 0: Recover deployed Convex source and commit the pre-existing work

**Files:**
- Create: `.claude/plans/convex-deployed-diff-2026-10-31.md`

**Interfaces:**
- Produces: a written diff summary that Task 4 reads before deleting server code.

- [ ] **Step 1: Commit the pre-existing uncommitted work in three atomic commits**

```bash
git add src/utils/signInOutcome.ts src/utils/__tests__/signInOutcome.test.ts src/components/auth/SignInCodeStep.tsx "app/(auth)/sign-in.tsx"
git commit -m "fix(auth): handle every Clerk sign-in status instead of silent no-op"
git add package.json package-lock.json
git commit -m "test: add jest-expo and npm test script"
git add app.json docs/
git commit -m "docs: add Google Play submission package and bump versionCode"
```

- [ ] **Step 2: Open the Convex dashboard for production deployment `resolute-hummingbird-508`, Functions tab, and copy the source of `parkeaz:renewalAction`, `renewal:tick`, `renewal:saveResult`, `renewal:handleFailure`, `sessions:create` into the session scratchpad directory under `deployed/` (one file each)**

- [ ] **Step 3: Diff each against the repository file**

Run: `diff <scratch file> convex/<file>.ts`
Expected: differences at least in `parkeaz.ts` (deployed logs `FAILED_TO_EXTRACT_PARKID` with `htmlHead`/`htmlTail`).

- [ ] **Step 4: Write `.claude/plans/convex-deployed-diff-2026-10-31.md`**

Sections: `Files compared`, `Deployed-only changes` (one bullet per behavioral difference, file and function named), `Carried forward into this plan` (which differences matter after `parkeaz.ts` is deleted; expected answer: none, because the whole action is removed, but say so explicitly per file), `Dev deployment used for testing: dev:tidy-seal-196`.

- [ ] **Step 5: Commit**

```bash
git add .claude/plans/convex-deployed-diff-2026-10-31.md
git commit -m "docs: record deployed Convex source diff before renewal rewrite"
```

---

### Task 1: Shared renewal domain module

**Files:**
- Create: `src/domain/renewal.ts`
- Test: `src/domain/__tests__/renewal.test.ts`

**Interfaces:**
- Produces:
  - `REGISTRATION_MS = 2 * 60 * 60 * 1000`, `DUE_BUFFER_MS = 10 * 60 * 1000`, `DAILY_DURATION_MS = 24 * 60 * 60 * 1000`, `EXPIRY_WARNING_MS = 15 * 60 * 1000`, `TOKEN_WINDOW_MS = 2 * 60 * 1000`
  - `type RenewalSessionLike = { status: string; desiredEndTime: number; lastParkEnd?: number; lapsedAt?: number; dueAt?: number; currentParkId?: string }`
  - `type SessionState = { kind: "awaiting_first" } | { kind: "registered"; until: number } | { kind: "due"; until: number } | { kind: "unregistered"; since: number } | { kind: "done" }`
  - `deriveSessionState(session: RenewalSessionLike, now: number): SessionState`
  - `computeDueAt(parkEnd: number): number`
  - `shouldSendDuePush(session: RenewalSessionLike, scheduledForParkEnd: number): boolean`
  - `shouldMarkLapsed(session: RenewalSessionLike, scheduledForParkEnd: number, now: number): boolean`
  - `isDuplicateRegistration(session: RenewalSessionLike, parkId: string): boolean`
  - `normalizePlate(raw: string): string` — uppercase, strip everything not `A-Z0-9`
  - `normalizeGuestCode(raw: string): string | null` — trim, uppercase; `null` unless 4–12 chars of `A-Z0-9`

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/__tests__/renewal.test.ts
import {
  deriveSessionState, computeDueAt, shouldSendDuePush, shouldMarkLapsed,
  isDuplicateRegistration, normalizePlate, normalizeGuestCode,
  DUE_BUFFER_MS, REGISTRATION_MS,
} from "../renewal";

const T0 = 1_800_000_000_000;
const base = { status: "active", desiredEndTime: T0 + 24 * 3600_000 };

describe("deriveSessionState", () => {
  test("active with no registration yet is awaiting_first", () => {
    expect(deriveSessionState(base, T0)).toEqual({ kind: "awaiting_first" });
  });
  test("before dueAt is registered until lastParkEnd", () => {
    const s = { ...base, lastParkEnd: T0 + REGISTRATION_MS, dueAt: T0 + REGISTRATION_MS - DUE_BUFFER_MS };
    expect(deriveSessionState(s, T0 + 1)).toEqual({ kind: "registered", until: s.lastParkEnd });
  });
  test("at exactly dueAt is due", () => {
    const s = { ...base, lastParkEnd: T0 + REGISTRATION_MS, dueAt: T0 + REGISTRATION_MS - DUE_BUFFER_MS };
    expect(deriveSessionState(s, s.dueAt)).toEqual({ kind: "due", until: s.lastParkEnd });
  });
  test("at exactly lastParkEnd with lapsedAt set is unregistered since lastParkEnd", () => {
    const s = { ...base, lastParkEnd: T0, lapsedAt: T0, dueAt: T0 - DUE_BUFFER_MS };
    expect(deriveSessionState(s, T0)).toEqual({ kind: "unregistered", since: T0 });
  });
  test("past lastParkEnd without lapsedAt (push not yet processed) is still unregistered since lastParkEnd", () => {
    const s = { ...base, lastParkEnd: T0, dueAt: T0 - DUE_BUFFER_MS };
    expect(deriveSessionState(s, T0 + 5_000)).toEqual({ kind: "unregistered", since: T0 });
  });
  test("completed is done regardless of times", () => {
    expect(deriveSessionState({ ...base, status: "completed" }, T0)).toEqual({ kind: "done" });
  });
  test("legacy statuses renewing and failed behave as active", () => {
    expect(deriveSessionState({ ...base, status: "renewing" }, T0)).toEqual({ kind: "awaiting_first" });
    expect(deriveSessionState({ ...base, status: "failed" }, T0)).toEqual({ kind: "awaiting_first" });
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
    expect(shouldSendDuePush({ ...s, lastParkEnd: T0 + REGISTRATION_MS }, T0)).toBe(false);
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
  test("false when already lapsed for this registration", () => {
    expect(shouldMarkLapsed({ ...s, lapsedAt: T0 }, T0, T0 + 1)).toBe(false);
  });
  test("false when a newer registration exists", () => {
    expect(shouldMarkLapsed({ ...s, lastParkEnd: T0 + REGISTRATION_MS }, T0, T0)).toBe(false);
  });
});

test("isDuplicateRegistration matches currentParkId exactly", () => {
  expect(isDuplicateRegistration({ ...base, currentParkId: "123456" }, "123456")).toBe(true);
  expect(isDuplicateRegistration({ ...base, currentParkId: "123456" }, "123457")).toBe(false);
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/domain`
Expected: FAIL, `Cannot find module '../renewal'`.

- [ ] **Step 3: Implement `src/domain/renewal.ts` with the exported names and signatures above**

`deriveSessionState` order of checks: `status === "completed" || "cancelled"` → `done`; no `lastParkEnd` → `awaiting_first`; `now >= lastParkEnd` → `unregistered` with `since: lastParkEnd`; `dueAt !== undefined && now >= dueAt` → `due`; else `registered`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/domain`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain
git commit -m "feat(renewal): add shared renewal timing and session state domain module"
```

---

### Task 2: Guest code on the user profile

**Files:**
- Modify: `convex/schema.ts` (users table)
- Modify: `convex/users.ts` (add `updateGuestCode`)
- Modify: `app/(tabs)/settings.tsx` (new "Guest code" field)
- Modify: `app/(auth)/profile-setup.tsx` (optional "Guest code" field after Email, label `Guest code`, helper text `From your building's guest parking instructions.`)

**Interfaces:**
- Consumes: `normalizeGuestCode` from Task 1.
- Produces: `users.guestCode?: string` on the profile returned by `api.users.getProfile`; mutation `api.users.updateGuestCode({ guestCode: string })` that throws `Error("Guest code must be 4-12 letters or digits")` on invalid input.

- [ ] **Step 1: Add `guestCode: v.optional(v.string())` to `users` in `convex/schema.ts`**

- [ ] **Step 2: Add `updateGuestCode` mutation to `convex/users.ts`**

Signature: `args: { guestCode: v.string() }`. Auth pattern identical to `updateNotificationPrefs` (lines 55-75). Normalize with `normalizeGuestCode`; throw the error above on `null`; patch `{ guestCode }`.

- [ ] **Step 3: Push schema and functions to the dev deployment and verify**

Run: `npx convex dev --once`
Expected: `Convex functions ready!` with no schema errors.

- [ ] **Step 4: Settings field**

In `app/(tabs)/settings.tsx`, add a section titled `Parking` above the notification prefs with a `FormField` labelled `Guest code`, prefilled from `profile.guestCode`, saving on blur via `useMutation(api.users.updateGuestCode)`; show the thrown message under the field. Reuse the existing section/row styles in that file.

- [ ] **Step 5: Profile-setup field**

In `app/(auth)/profile-setup.tsx`, add the optional `Guest code` `FormField` after `Email` (line 151). On submit, if non-empty, call `updateGuestCode` after `upsertProfile`.

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint "app/(tabs)/settings.tsx" "app/(auth)/profile-setup.tsx" convex/users.ts`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add convex/schema.ts convex/users.ts "app/(tabs)/settings.tsx" "app/(auth)/profile-setup.tsx"
git commit -m "feat(profile): store ParkEaz guest code per user"
```

---

### Task 3: ParkEaz page scripts and parsers

**Files:**
- Create: `src/parkeaz/pages.ts`
- Create: `src/parkeaz/__fixtures__/paid.html` (copy of the probe capture at `/private/tmp/claude-501/-Users-fontezbrooks-Development-parkDaddy/8b6e04a6-0029-4f5e-8a51-c885eca316c6/scratchpad/parkeaz/form.html`; if that path is gone, re-capture with `curl -sL -A "Mozilla/5.0" "https://paid.parkeaz.com/paid?zone=622&propertyid=202"`)
- Create: `src/parkeaz/__fixtures__/select_product.html`, `checkout.html`, `successful_transaction.html`, `paid-broken.html` (synthetic, built from the element ids and names recorded on 2026-10-31; replace with real captures during Task 7 device testing)
- Test: `src/parkeaz/__tests__/pages.test.ts`
- Modify: `package.json` (devDependency `jest-environment-jsdom`)

**Interfaces:**
- Produces:
  - `const PARKEAZ_ORIGIN = "https://paid.parkeaz.com"`, `const PARKEAZ_START_URL = PARKEAZ_ORIGIN + "/paid?zone=622&propertyid=202"`, `const ZONE = "622"`
  - `type ParkEazPage = "paid" | "select_product" | "checkout" | "success" | "other"`
  - `detectPage(url: string): ParkEazPage` — `success` when pathname is `/successful_transaction` or query has `parkid`
  - `type AutofillValues = { plate: string; mobile: string; email: string; firstName: string; lastName: string; guestCode: string }`
  - `buildInjection(page: ParkEazPage, values: AutofillValues): string | null` — JS source for the WebView; `null` for `checkout`, `success`, `other`. The script posts exactly one message via `window.ReactNativeWebView.postMessage(JSON.stringify(msg))` where `msg` is `{ type: "autofill", page, result: "applied" | "skipped" }`; on `success` pages Task 5 injects `SUCCESS_PROBE_SCRIPT` instead.
  - `const SUCCESS_PROBE_SCRIPT: string` — posts `{ type: "success_page", url: location.href, text: document.body.innerText }`
  - `parsePageParkEnd(text: string, now: number): { parkEnd: number; source: "page" | "fallback" }` — Eastern-time parsing copied from the deleted server (`parseParkDate`/`getEasternOffsetMs` in `convex/parkeaz.ts` lines 70-86); fallback `now + REGISTRATION_MS`
  - `parseParkId(url: string): string | null`
  - `parseErrorMessage(url: string): string | null` — decoded `ErrorMessage` query param

- [ ] **Step 1: Install the jsdom test environment**

Run: `npx expo install jest-environment-jsdom -- --save-dev`
Expected: `package.json` devDependencies gains `jest-environment-jsdom`.

- [ ] **Step 2: Write the fixtures**

`paid.html`: copied capture. `select_product.html`: `<form method="post" action="https://paid.parkeaz.com/checkout">` with hidden inputs named exactly `tenant, spacenumber, mobile, email, firstname, lastname, vehiclemake, vehiclemodel, vehiclecolor, vehiclestate, couponcode, guestcode, postalcode, product(3615), parkallowtextalert(on), zone(622), zoneid(247), propertyid(202), plate, parkstart, extension(0)` and visible inputs `#mobile, #email, #firstname, #lastname, #guestcode`. `checkout.html`: a form posting to `/charge` with a `<button class="g-recaptcha">Register To Park</button>` and the field list from the probe (`parkstart, parkend, zone, zoneid, propertyid, propertyname, plate, tenantid, email, mobile, parkallowtextalert, spacenumber, firstname, lastname, vehiclemake, vehiclemodel, vehiclecolor, vehiclestate, product, producttime, couponid, coupondiscount, couponpriceadded, productprice, transactionfee, totalcharge, stripeprice, extension, guestcode`). `successful_transaction.html`: body text containing `Parking valid until 2026-10-31 21:07:15` and `parkid=123456` in a link. `paid-broken.html`: `paid.html` with `id="selecttime"` renamed to `id="selecttime2"`.

- [ ] **Step 3: Write the failing tests**

```ts
/**
 * @jest-environment jsdom
 */
// src/parkeaz/__tests__/pages.test.ts
import { readFileSync } from "fs";
import { join } from "path";
import {
  detectPage, buildInjection, parsePageParkEnd, parseParkId, parseErrorMessage, PARKEAZ_START_URL,
} from "../pages";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "..", "__fixtures__", name), "utf8");
const values = { plate: "PRBE0001", mobile: "4045550199", email: "p@example.com", firstName: "Probe", lastName: "Test", guestCode: "ABCD12" };

function runInjection(html: string, page: "paid" | "select_product") {
  document.documentElement.innerHTML = html;
  const posted: unknown[] = [];
  (window as any).ReactNativeWebView = { postMessage: (m: string) => posted.push(JSON.parse(m)) };
  for (const f of Array.from(document.forms)) f.submit = jest.fn();
  // eslint-disable-next-line no-new-func
  new Function(buildInjection(page, values)!)();
  return posted;
}

describe("detectPage", () => {
  test.each([
    [PARKEAZ_START_URL, "paid"],
    ["https://paid.parkeaz.com/select_product", "select_product"],
    ["https://paid.parkeaz.com/checkout", "checkout"],
    ["https://paid.parkeaz.com/successful_transaction?parkid=1&zone=622", "success"],
    ["https://paid.parkeaz.com/charge?parkid=99", "success"],
    ["https://paid.parkeaz.com/coupon", "other"],
  ])("%s -> %s", (url, page) => expect(detectPage(url)).toBe(page));
});

describe("buildInjection on /paid", () => {
  test("fills zone, plate, terms, clicks Select Time, posts applied", () => {
    const btn = jest.fn();
    document.documentElement.innerHTML = fixture("paid.html");
    document.getElementById("selecttime")!.addEventListener("click", btn);
    const posted = runInjection(document.documentElement.outerHTML, "paid");
    expect((document.getElementById("zone") as HTMLInputElement).value).toBe("622");
    expect((document.getElementById("plate") as HTMLInputElement).value).toBe("PRBE0001");
    expect((document.getElementById("parktermsagreed") as HTMLInputElement).checked).toBe(true);
    expect(posted).toEqual([{ type: "autofill", page: "paid", result: "applied" }]);
  });
  test("broken fixture changes nothing and posts skipped", () => {
    const posted = runInjection(fixture("paid-broken.html"), "paid");
    expect((document.getElementById("plate") as HTMLInputElement).value).toBe("");
    expect(posted).toEqual([{ type: "autofill", page: "paid", result: "skipped" }]);
  });
});

describe("buildInjection on /select_product", () => {
  test("fills contact fields and guest code and submits the form", () => {
    const posted = runInjection(fixture("select_product.html"), "select_product");
    expect((document.getElementById("guestcode") as HTMLInputElement).value).toBe("ABCD12");
    expect((document.getElementById("mobile") as HTMLInputElement).value).toBe("4045550199");
    expect(document.forms[0].submit).toHaveBeenCalledTimes(1);
    expect(posted).toEqual([{ type: "autofill", page: "select_product", result: "applied" }]);
  });
});

test("buildInjection returns null for checkout, success, other", () => {
  expect(buildInjection("checkout", values)).toBeNull();
  expect(buildInjection("success", values)).toBeNull();
  expect(buildInjection("other", values)).toBeNull();
});

describe("parsePageParkEnd", () => {
  const now = Date.UTC(2026, 9, 31, 23, 0, 0);
  test("reads Eastern time from the page as the correct instant regardless of device zone", () => {
    const { parkEnd, source } = parsePageParkEnd(fixture("successful_transaction.html"), now);
    expect(source).toBe("page");
    expect(new Date(parkEnd).toISOString()).toBe("2026-11-01T01:07:15.000Z"); // 21:07:15 EDT
  });
  test("falls back to now + 2h when no time is present", () => {
    expect(parsePageParkEnd("Thanks for parking", now)).toEqual({ parkEnd: now + 2 * 3600_000, source: "fallback" });
  });
});

test("parseParkId and parseErrorMessage", () => {
  expect(parseParkId("https://paid.parkeaz.com/successful_transaction?parkid=123456&zone=622")).toBe("123456");
  expect(parseParkId("https://paid.parkeaz.com/checkout")).toBeNull();
  expect(parseErrorMessage("https://paid.parkeaz.com/paid?ErrorMessage=Plate%20already%20registered")).toBe("Plate already registered");
  expect(parseErrorMessage("https://paid.parkeaz.com/paid")).toBeNull();
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `TZ=America/Los_Angeles npx jest src/parkeaz`
Expected: FAIL, `Cannot find module '../pages'`.

- [ ] **Step 5: Implement `src/parkeaz/pages.ts`**

`buildInjection` returns a self-contained IIFE string. For `paid`: required ids `zone, plate, parktermsagreed, selecttime`; if any is missing post `skipped` and return; else set values, dispatch `input` events, check terms, `click()` the button, post `applied`. For `select_product`: required ids `mobile, email, firstname, lastname, guestcode`; fill, then `document.forms[0].submit()`, post `applied`. Serialize `values` with `JSON.stringify` into the script; never interpolate raw strings.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `TZ=America/Los_Angeles npx jest src/parkeaz && npx jest src/parkeaz`
Expected: PASS under both zones.

- [ ] **Step 7: Commit**

```bash
git add src/parkeaz package.json package-lock.json
git commit -m "feat(parkeaz): add page detection, autofill injection, and success parsers"
```

---

### Task 4: Convex server rewrite

**Files:**
- Modify: `convex/schema.ts` (sessions and renewalLogs fields from spec §8)
- Rewrite: `convex/renewal.ts`
- Modify: `convex/sessions.ts` (`getActive`, `create`, `extend`, `cancel`; delete `retry`; add `recordRegistration`)
- Modify: `convex/notifications.ts` (add `sendDuePush`, `sendLapsePush`; edit `sendExpiryWarning`; delete `sendRenewalFailure`, `sendUrgentFailure`, `sendWeeklyCheckIn`, `WEEKLY_CHECK_IN_MS`)
- Rewrite: `convex/cronHandlers.ts` (`sweep`)
- Modify: `convex/crons.ts`
- Delete: `convex/parkeaz.ts`
- Modify: `convex/users.ts` (delete `updateMode`)

**Interfaces:**
- Consumes: Task 1 (`computeDueAt`, `shouldSendDuePush`, `shouldMarkLapsed`, `isDuplicateRegistration`, `normalizePlate`, `DAILY_DURATION_MS`, `EXPIRY_WARNING_MS`) imported as `../src/domain/renewal`.
- Produces:
  - `api.sessions.recordRegistration({ sessionId: Id<"sessions">; parkId: string; parkStart: number; parkEnd: number; parkEndSource: "page" | "fallback" }): Promise<void>` — throws `Error("Not authorized")` for another user's session; no-op when `isDuplicateRegistration`.
  - `api.sessions.getActive` returns the session (statuses `active` only, legacy `renewing`/`failed` are patched to `active` by `sweep`) plus `renewalLogs`.
  - `api.sessions.create` returns `Id<"sessions">` and no longer schedules any registration.
  - `internal.renewal.sendDuePush`, `internal.renewal.markLapsed`, `internal.renewal.completeAtDesiredEnd`, each `{ sessionId }` plus `scheduledForParkEnd` on the first two.
  - `internal.cronHandlers.sweep` every 30 minutes.

- [ ] **Step 1: Schema**

Add to `sessions`: `dueAt`, `lapsedAt`, `duePushId`, `lapsePushId`, `completionId` (all optional; the Id ones `v.id("_scheduled_functions")`), `migratedFromExtendedAt: v.optional(v.number())`. Add to `renewalLogs`: `source: v.optional(v.union(v.literal("server"), v.literal("client")))`, `parkEndSource: v.optional(v.union(v.literal("page"), v.literal("fallback")))`.

- [ ] **Step 2: Rewrite `convex/renewal.ts`**

Keep `cancelScheduled`. Export:
- `sendDuePush = internalMutation({ args: { sessionId, scheduledForParkEnd: v.number() } })`: load session; if `!shouldSendDuePush(session, scheduledForParkEnd)` return; schedule `internal.notifications.sendDuePush` with `{ sessionId }`.
- `markLapsed = internalMutation({ args: { sessionId, scheduledForParkEnd } })`: if `!shouldMarkLapsed(session, scheduledForParkEnd, Date.now())` return; patch `{ lapsedAt: Date.now() }`; insert renewalLogs `{ action: "lapsed" }`; schedule `internal.notifications.sendLapsePush`.
- `completeAtDesiredEnd = internalMutation({ args: { sessionId } })`: if status not `active` return; cancel `duePushId`, `lapsePushId`, `expiryWarningId`; patch `{ status: "completed", duePushId: undefined, lapsePushId: undefined, completionId: undefined }`; insert renewalLogs `{ action: "completed" }`; schedule `internal.notifications.sendSessionEnded`.
- `scheduleRegistrationPushes(ctx, session, parkEnd)` (plain async function, not exported as a Convex function): cancel previous `duePushId`/`lapsePushId`; `runAt(computeDueAt(parkEnd), internal.renewal.sendDuePush, { sessionId, scheduledForParkEnd: parkEnd })` only if `computeDueAt(parkEnd) < session.desiredEndTime`; `runAt(parkEnd, internal.renewal.markLapsed, { sessionId, scheduledForParkEnd: parkEnd })` only if `parkEnd < session.desiredEndTime`; return `{ duePushId, lapsePushId }`.
Delete `tick`, `saveResult`, `handleFailure`, `TERMINAL_STATES`, `BUFFER_MS`.

- [ ] **Step 3: `convex/sessions.ts`**

- `recordRegistration` (public `mutation`): auth + ownership check as in `cancel`; `if (session.status !== "active") throw new Error("Session is not active")`; `if (isDuplicateRegistration(session, args.parkId)) return;`; insert renewalLogs `{ action: "registered", parkId, parkStart, parkEnd, source: "client", parkEndSource }`; `const ids = await scheduleRegistrationPushes(ctx, session, args.parkEnd)`; patch `{ currentParkId, lastParkStart, lastParkEnd, dueAt: computeDueAt(parkEnd), lapsedAt: undefined, nextRenewalAt: undefined, ...ids }`; if `user.notifyOnSuccess` schedule the existing success push path if one exists, otherwise skip.
- `create`: `plate = normalizePlate(args.plate)`; drop `mode` branching; `desiredEndTime = now + DAILY_DURATION_MS`; insert without `mode`; remove the `renewal.tick` call; schedule `expiryWarningId` as now and `completionId = runAt(desiredEndTime, internal.renewal.completeAtDesiredEnd, { sessionId })`; patch both ids.
- `extend`: remove the extended-mode throw; after computing `newDesiredEndTime`, cancel and reschedule `completionId`; remove `retryCount` reset and the `renewal.tick` call.
- `cancel`: also cancel `duePushId`, `lapsePushId`, `completionId` and clear them in the patch.
- `getActive`: `activeStatuses = ["active"]`.
- Delete `retry`.
- Remove `WEEKLY_CHECK_IN_MS` and the import of `DAILY_DURATION_MS`/`EXPIRY_WARNING_MS` locals in favor of the domain module.

- [ ] **Step 4: `convex/notifications.ts`**

Add `sendDuePush` and `sendLapsePush` (`internalMutation({ args: { sessionId } })`), same guard shape as `sendExpiryWarning` (lines 6-24) with status check `=== "active"`, no user-pref gate (these are the product), copy from Global Constraints, `data: { route: "/renew", sessionId }`, no `categoryIdentifier`. Edit `sendExpiryWarning`: status check `=== "active"`, body `Add 24 more hours for ${session.plate}?`, remove `categoryIdentifier`. Delete `sendRenewalFailure`, `sendUrgentFailure`, `sendWeeklyCheckIn`, `WEEKLY_CHECK_IN_MS`.

- [ ] **Step 5: `convex/cronHandlers.ts` and `convex/crons.ts`**

Replace `safetyNetScan` with `sweep`: (a) sessions with status `renewing` or `failed` → patch `{ status: "active", retryCount: 0, lastError: undefined, renewingAt: undefined }`; (b) active sessions with `desiredEndTime === Number.MAX_SAFE_INTEGER` → cancel `weeklyCheckInId`, patch `{ desiredEndTime: now + DAILY_DURATION_MS, weeklyCheckInId: undefined, migratedFromExtendedAt: now }`, schedule `completeAtDesiredEnd` and store `completionId`; (c) active sessions with `desiredEndTime <= now` → schedule `completeAtDesiredEnd` now. Use `withIndex("by_status", ...)` for each status. `crons.ts`: name `"session sweep"`, `{ minutes: 30 }`, `internal.cronHandlers.sweep`.

- [ ] **Step 6: Delete `convex/parkeaz.ts` and `users.updateMode`; nothing reads `PARKEAZ_GUEST_CODE` after deletion (leave the env var in the dashboard)**

- [ ] **Step 7: Verify the deployment compiles against the dev deployment**

Run: `npx convex dev --once && npx tsc --noEmit`
Expected: `Convex functions ready!`; tsc no output. The `_generated/api.d.ts` no longer lists `parkeaz`, `renewal.tick`, `sessions.retry`, `users.updateMode`.

- [ ] **Step 8: Exercise on the dev deployment from the dashboard**

Run `sessions:create` as a test user, then `sessions:recordRegistration` with `parkId "1"`, `parkStart now`, `parkEnd now + 7_200_000`, `parkEndSource "page"`. In Scheduled Functions confirm exactly one `renewal:sendDuePush` at `parkEnd - 10 min` and one `renewal:markLapsed` at `parkEnd`. Run `recordRegistration` again with the same `parkId`: confirm no new scheduled functions and one `registered` log row.

- [ ] **Step 9: Commit**

```bash
git add convex
git commit -m "feat(convex): replace unattended ParkEaz renewal with client-recorded registrations"
```

---

### Task 5: Renewal screen

**Files:**
- Create: `src/parkeaz/renewFlow.ts` (pure reducer)
- Test: `src/parkeaz/__tests__/renewFlow.test.ts`
- Create: `src/components/renew/RenewBanner.tsx`
- Create: `app/renew.tsx`
- Modify: `app/_layout.tsx` (Stack screen `renew`, `ALLOWED_NOTIFICATION_ROUTES` add `"/renew"`)
- Modify: `package.json` (`react-native-webview` via `npx expo install react-native-webview`)

**Interfaces:**
- Consumes: Task 3 (`detectPage`, `buildInjection`, `SUCCESS_PROBE_SCRIPT`, `parsePageParkEnd`, `parseParkId`, `parseErrorMessage`, `PARKEAZ_START_URL`), Task 4 (`api.sessions.recordRegistration`, `api.sessions.getActive`), Task 2 (`profile.guestCode`).
- Produces:
  - `type RenewFlowState = { step: "loading" } | { step: "page"; page: ParkEazPage; autofill: "pending" | "applied" | "skipped" } | { step: "parkeaz_error"; message: string } | { step: "load_error" } | { step: "saving"; parkId: string; parkStart: number; parkEnd: number; parkEndSource: "page" | "fallback" } | { step: "save_failed"; parkId: string; parkStart: number; parkEnd: number; parkEndSource: "page" | "fallback" } | { step: "done" }`
  - `type RenewFlowEvent = { type: "navigated"; url: string } | { type: "autofill"; page: ParkEazPage; result: "applied" | "skipped" } | { type: "success_page"; url: string; text: string; now: number } | { type: "load_error" } | { type: "save_ok" } | { type: "save_failed" } | { type: "retry" }`
  - `renewFlowReducer(state: RenewFlowState, event: RenewFlowEvent): RenewFlowState`
  - `bannerText(state: RenewFlowState): string` — exact copy: loading `Loading ParkEaz…`; page paid/select_product pending `Filling in your details…`; page skipped `ParkEaz changed their page. Fill it in by hand.`; page checkout `Tap Register To Park`; parkeaz_error → the message; load_error `Couldn't reach ParkEaz. Tap Retry.`; saving `Saving…`; save_failed `Registered with ParkEaz but we couldn't save it. Confirmation {parkId}.`; done `Registered.`
  - `parseRenewParams(params: Record<string, unknown>): string | null` — returns `sessionId` only if a non-empty string.

- [ ] **Step 1: Write the failing reducer tests**

```ts
// src/parkeaz/__tests__/renewFlow.test.ts
import { renewFlowReducer, bannerText, parseRenewParams, type RenewFlowState } from "../renewFlow";

const now = 1_800_000_000_000;
const loading: RenewFlowState = { step: "loading" };

test("navigating to /paid enters page state with autofill pending", () => {
  expect(renewFlowReducer(loading, { type: "navigated", url: "https://paid.parkeaz.com/paid?zone=622&propertyid=202" }))
    .toEqual({ step: "page", page: "paid", autofill: "pending" });
});
test("autofill skipped is recorded and banner asks for manual entry", () => {
  const s = renewFlowReducer({ step: "page", page: "paid", autofill: "pending" }, { type: "autofill", page: "paid", result: "skipped" });
  expect(s).toEqual({ step: "page", page: "paid", autofill: "skipped" });
  expect(bannerText(s)).toBe("ParkEaz changed their page. Fill it in by hand.");
});
test("checkout banner tells the user to tap Register To Park", () => {
  expect(bannerText({ step: "page", page: "checkout", autofill: "pending" })).toBe("Tap Register To Park");
});
test("ErrorMessage in URL becomes parkeaz_error with decoded text", () => {
  expect(renewFlowReducer(loading, { type: "navigated", url: "https://paid.parkeaz.com/paid?ErrorMessage=Plate%20already%20registered" }))
    .toEqual({ step: "parkeaz_error", message: "Plate already registered" });
});
test("success page with parkid and parkend enters saving", () => {
  const s = renewFlowReducer({ step: "page", page: "checkout", autofill: "pending" }, {
    type: "success_page", url: "https://paid.parkeaz.com/successful_transaction?parkid=123456", text: "Parking valid until 2026-10-31 21:07:15", now,
  });
  expect(s).toMatchObject({ step: "saving", parkId: "123456", parkStart: now, parkEndSource: "page" });
});
test("success page without parkend uses fallback", () => {
  const s = renewFlowReducer(loading, { type: "success_page", url: "https://x/successful_transaction?parkid=7", text: "ok", now });
  expect(s).toMatchObject({ step: "saving", parkId: "7", parkEnd: now + 7_200_000, parkEndSource: "fallback" });
});
test("save_failed keeps the values and banner shows the confirmation id", () => {
  const saving: RenewFlowState = { step: "saving", parkId: "123456", parkStart: now, parkEnd: now + 1, parkEndSource: "page" };
  const s = renewFlowReducer(saving, { type: "save_failed" });
  expect(s).toEqual({ ...saving, step: "save_failed" });
  expect(bannerText(s)).toBe("Registered with ParkEaz but we couldn't save it. Confirmation 123456.");
  expect(renewFlowReducer(s, { type: "retry" })).toEqual(saving);
});
test("retry from load_error or parkeaz_error returns to loading", () => {
  expect(renewFlowReducer({ step: "load_error" }, { type: "retry" })).toEqual(loading);
  expect(renewFlowReducer({ step: "parkeaz_error", message: "x" }, { type: "retry" })).toEqual(loading);
});
test("save_ok is done", () => {
  expect(renewFlowReducer({ step: "saving", parkId: "1", parkStart: now, parkEnd: now, parkEndSource: "page" }, { type: "save_ok" })).toEqual({ step: "done" });
});
test("parseRenewParams rejects missing, empty, and non-string ids", () => {
  expect(parseRenewParams({ sessionId: "abc" })).toBe("abc");
  expect(parseRenewParams({})).toBeNull();
  expect(parseRenewParams({ sessionId: "" })).toBeNull();
  expect(parseRenewParams({ sessionId: ["a", "b"] })).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/parkeaz/__tests__/renewFlow.test.ts`
Expected: FAIL, `Cannot find module '../renewFlow'`.

- [ ] **Step 3: Implement `src/parkeaz/renewFlow.ts`**

`navigated` checks `parseErrorMessage` first, then `detectPage`; a `success` page from `navigated` stays in `page` state (the probe script's `success_page` event carries the text needed for `parkEnd`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/parkeaz`
Expected: PASS.

- [ ] **Step 5: Install the WebView**

Run: `npx expo install react-native-webview`
Expected: dependency added at the Expo 54 compatible version.

- [ ] **Step 6: `src/components/renew/RenewBanner.tsx`**

Props `{ text: string; elapsedSeconds: number; showRetry: boolean; onRetry: () => void; onClose: () => void }`. Announces `text` changes with `AccessibilityInfo.announceForAccessibility` (iOS) and `accessibilityLiveRegion="polite"` (Android). Buttons have `accessibilityRole="button"` and labels `Retry`, `Close`. Styles from `@/src/theme`, no inline literals.

- [ ] **Step 7: `app/renew.tsx`**

`parseRenewParams(useLocalSearchParams())`; `null` → `router.replace("/(tabs)")` and return `null`. `useQuery(api.sessions.getActive)` and `api.users.getProfile`; if the active session id differs from the param → replace to Home. `useReducer(renewFlowReducer, { step: "loading" })`. `WebView` props: `source={{ uri: PARKEAZ_START_URL }}`, `ref`, `onLoadEnd` → dispatch `navigated` with `nativeEvent.url`, then if `buildInjection(page, values)` is non-null call `webViewRef.current?.injectJavaScript(script)`, and if page is `success` inject `SUCCESS_PROBE_SCRIPT`; `onMessage` → parse JSON, dispatch `autofill` or `success_page` (with `now: Date.now()`); `onError` → `load_error`. On entering `saving`, call `recordRegistration`; `save_ok` → `router.replace("/(tabs)")`; catch → `save_failed`. `retry` from `load_error`/`parkeaz_error` reloads `PARKEAZ_START_URL`; from `save_failed` re-sends the mutation. `AppState` listener: on `active` while in a `page` state, reload `PARKEAZ_START_URL`. Sentry: `addBreadcrumb({ category: "renew", message: "renew_page", data: { pathname, autofill } })` on each `autofill` event; `addBreadcrumb({ category: "renew", message: "renew_result", data: { result, elapsedMs } })` on `done`, `parkeaz_error`, `load_error`, and on unmount before `done` with `result: "abandoned"`; `captureMessage("renew_parkend_fallback", "warning")` when `parkEndSource === "fallback"`. Values passed to `buildInjection` come from the session (plate, mobile, email, firstName, lastName) and `profile.guestCode ?? ""`.

- [ ] **Step 8: Register the route**

In `app/_layout.tsx`: add `<Stack.Screen name="renew" options={{ headerShown: true, title: "Renew Parking" }} />`; add `"/renew"` to `ALLOWED_NOTIFICATION_ROUTES`. The notification observer must append `?sessionId=` from `response.notification.request.content.data.sessionId` when `route === "/renew"`.

- [ ] **Step 9: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint app/renew.tsx app/_layout.tsx src/components/renew src/parkeaz`
Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add app/renew.tsx app/_layout.tsx src/components/renew src/parkeaz package.json package-lock.json
git commit -m "feat(renew): add in-app ParkEaz renewal screen with autofill and success capture"
```

---

### Task 6: Home, start flow, notifications wiring, copy

**Files:**
- Modify: `app/(tabs)/index.tsx` (`ActiveState` lines 76-331; the two `"24 hours · auto-renewing"` strings at 407 and 482; remove `ModeToggle` usage and `api.sessions.retry`)
- Delete: `src/components/ModeToggle.tsx`
- Modify: `app/start-parking.tsx` (lines 36-42 navigation; lines 113-125 copy)
- Modify: `app/extend-duration.tsx` (remove `autoExtend` param handling, lines 20-56)
- Modify: `app/_layout.tsx` (remove `setNotificationCategoryAsync("extend_24h", …)` lines 72-80 and the `EXTEND_24H` branch lines 107-110)
- Modify: `app/(tabs)/history.tsx` (remove `extended` branches)
- Modify: `app/(tabs)/settings.tsx:221` copy `When a registration succeeds`
- Modify: `src/components/WhatsNewSheet.tsx:28` (replace the Extended Stay entry with: title `Renewals now take one tap`, body `ParkEaz added a human check. We'll ping you 10 minutes before each 2-hour window ends; tap once and you're covered.`)
- Modify: `docs/store-listing.md` (every line found by `grep -n -i "auto" docs/store-listing.md`)

**Interfaces:**
- Consumes: `deriveSessionState` (Task 1), `api.sessions.recordRegistration` indirectly via `/renew` (Task 5), `migratedFromExtendedAt` (Task 4).

- [ ] **Step 1: `ActiveState` in `app/(tabs)/index.tsx`**

Compute `const state = deriveSessionState(session, now)` with a 30-second `now` ticker. Render by `state.kind`: `awaiting_first` → kicker `Not registered yet`, headline `Tap to register`, primary CTA `Register now` → `router.push({ pathname: "/renew", params: { sessionId: session._id } })`; `registered` → kicker `Registered until`, headline `HH:MM` from `state.until`, CTA `Add time` as today; `due` → kicker `Renewal due`, headline `HH:MM`, primary CTA `Renew now`; `unregistered` → kicker `Unregistered since`, headline `HH:MM` from `state.since`, primary CTA `Renew now`, kicker style `styles.kickerError`. Keep `End session`. Delete the `isFailed`, `isRenewing`, `isExtended` branches, `retryMutation`, `Linking.openURL("https://paid.parkeaz.com")`. If `session.migratedFromExtendedAt` is set, render an `InlineError`-styled notice `Extended Stay is gone: ParkEaz now requires a tap every 2 hours. This session ends at HH:MM.` using `desiredEndTime`.

- [ ] **Step 2: Replace the two `"24 hours · auto-renewing"` strings with `"24 hours · one tap every 2 hours"` and remove `ModeToggle` from Home; delete `src/components/ModeToggle.tsx`**

- [ ] **Step 3: `app/start-parking.tsx`**

After `createSession` returns `sessionId`: `router.dismissAll(); router.replace({ pathname: "/renew", params: { sessionId } })`. Replace the summary copy with headline `Covered for 24 hours, one tap at a time.` and body `ParkEaz needs a human check every 2 hours. We'll ping you 10 minutes before each window ends.` Remove the `mode` variable.

- [ ] **Step 4: `app/extend-duration.tsx` and `app/_layout.tsx`**

Delete the `autoExtend` param, ref, and effect. Delete the `extend_24h` category registration and the `EXTEND_24H` branch in `useNotificationObserver`.

- [ ] **Step 5: `history.tsx`, `settings.tsx:221`, `WhatsNewSheet.tsx`, `docs/store-listing.md` copy per the Files list**

Store listing: subtitle `One-tap guest parking renewals`; promotional text `Guest parking at Ponce Springs Lofts resets every 2 hours. parkDaddy pings you before each window ends and gets you re-registered in one tap.`; rewrite the two description paragraphs and the step 3 line to describe the tap, and remove "on the server", "No app to keep open", "No midnight re-registrations", "set it and forget it". Keywords: replace `auto renew` with `renewal reminder`.

- [ ] **Step 6: Search for leftovers**

Run: `grep -rn -i -E "auto-?renew|renewing|extended stay|sessions\.retry|updateMode|EXTEND_24H|autoExtend" app src docs/store-listing.md`
Expected: no matches.

- [ ] **Step 7: Type-check, lint, tests**

Run: `npx tsc --noEmit && npx eslint app src && npx jest`
Expected: tsc and eslint no output; jest all suites pass.

- [ ] **Step 8: Commit**

```bash
git add app src docs/store-listing.md
git commit -m "feat(home): show derived registration state and one-tap renew flow; remove Extended Stay"
```

---

### Task 7: Dependency cleanup, version bump, device verification, release

**Files:**
- Modify: `package.json` (remove `node-fetch`, `tough-cookie`, `@types/node-fetch`, `@types/tough-cookie`)
- Modify: `app.json` (`version` `3.3.0`, `ios.buildNumber` `20`, `android.versionCode` `4`)
- Create: `.claude/plans/human-in-loop-renewal-device-checklist.md`
- Modify: `docs/google-play-submission.md` (release notes text for 3.3.0; note that the production AAB must be rebuilt from this commit)
- Modify: `src/parkeaz/__fixtures__/select_product.html`, `checkout.html`, `successful_transaction.html` (replace synthetic fixtures with captures from step 4)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Remove the dead server dependencies**

Run: `npm uninstall node-fetch tough-cookie @types/node-fetch @types/tough-cookie && grep -rn -E "node-fetch|tough-cookie" convex src app`
Expected: grep prints nothing.

- [ ] **Step 2: Bump versions in `app.json` to the Global Constraints values**

- [ ] **Step 3: Full verification**

Run: `npx tsc --noEmit && npx eslint . && npx jest && npx expo-doctor`
Expected: no errors; expo-doctor all checks pass (warnings about unrelated packages are acceptable, record them in the checklist file).

- [ ] **Step 4: Preview builds and device checklist**

Run: `eas build --platform all --profile preview`. Write `.claude/plans/human-in-loop-renewal-device-checklist.md` with one checkbox per spec acceptance criterion AC-1 through AC-9 plus the regression items (email sign-in statuses, Google SSO cold start). While running AC-1 on a device, use Safari Web Inspector or Chrome remote debugging to save the live HTML of `/select_product`, `/checkout`, and `/successful_transaction` into the fixture files, then re-run `npx jest src/parkeaz` and fix selectors if the real pages differ. Record pass/fail per item with device, OS, and build id.

- [ ] **Step 5: Deploy Convex to production**

Precondition: Task 0 diff file exists and the checklist shows AC-1, AC-2, AC-3, AC-7, AC-8 passing on the dev deployment.
Run: `npx convex deploy`
Expected: `Deployed Convex functions to https://resolute-hummingbird-508.convex.cloud`. Then confirm in the dashboard that `sweep` has run once and no session remains in `renewing` or `failed`.

- [ ] **Step 6: Production builds**

Run: `eas build --platform all --profile production`. iOS: `eas submit --platform ios`. Android: upload the AAB per `docs/google-play-submission.md`, release notes `Renewals now take one tap. ParkEaz added a human check; parkDaddy pings you before each 2-hour window ends.`

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json app.json .claude/plans/human-in-loop-renewal-device-checklist.md docs/google-play-submission.md src/parkeaz/__fixtures__
git commit -m "chore(release): 3.3.0 one-tap renewals; drop server scraping dependencies"
```

---

## Self-review notes

- Spec coverage: FR-1–3 (Tasks 4, 6), FR-4–11 (Tasks 1, 4), FR-12–18 (Tasks 3, 5), FR-19–23 (Tasks 4, 5, 6), FR-24–25 (Task 6), FR-26–29 (Tasks 0, 4, 7), NFR-1 (Task 4 `sweep` migration, AC-6 in Task 7 checklist), NFR-2–6 (Tasks 5, 7), §7 error table (Task 5 reducer and screen), §8 (Tasks 2, 4), §9–11 (Task 7).
- Names used consistently: `recordRegistration`, `sendDuePush`, `markLapsed`, `completeAtDesiredEnd`, `scheduleRegistrationPushes`, `deriveSessionState`, `renewFlowReducer`, `bannerText`, `buildInjection`, `SUCCESS_PROBE_SCRIPT`, `parsePageParkEnd`.
- Review Focus items 1–5 each have a test in Tasks 3, 1, 1, 5, 5 respectively and wiring in Tasks 4 and 5.
