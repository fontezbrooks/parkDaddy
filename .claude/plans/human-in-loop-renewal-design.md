# Human-in-the-Loop Renewal (Option C) — Requirements and Design

Status: approved design, not yet implemented
Date: 2026-10-31
Supersedes: unattended server-side ParkEaz registration (`convex/parkeaz.ts`), Extended Stay mode (`on-off-switch-design.md`)

## 1. Problem

ParkEaz added Google reCAPTCHA v2 Invisible to the guest-parking purchase flow at
`https://paid.parkeaz.com`. Verified by read-only probe on 2026-10-31:

- `/paid?zone=622&propertyid=202` renders a form that posts to a new step
  `select_product`. Its submit button carries `class="g-recaptcha"`,
  `data-callback="onSubmit"`, sitekey `6LcSMrYU…`.
- `/select_product` renders the contact form that posts to `/checkout`. No CAPTCHA.
- `/checkout` renders the confirmation page. Its "Register To Park" button is a
  second invisible reCAPTCHA.
- `/charge` rejects any request without a fresh token:
  `Error: CAPTCHA challenge missing. Please try again.` (64-byte body, HTTP 200).
- Solving the first CAPTCHA does not carry to `/charge`. Same PHP session, no
  token, same error. Session reuse is not possible.
- Zone 622 sells exactly one product: `3615` = 2 hours, $0.00.

Consequence: a reCAPTCHA token can only be produced by Google's script running in
a real browser the user is present in, is single-use, and expires after 2 minutes.
The current design, where a Convex Node action re-registers the plate every 2
hours unattended, cannot work. Every renewal needs a human tap.

Separately, production Convex code is ahead of this repository. The deployed
action logs `FAILED_TO_EXTRACT_PARKID` with `htmlHead`/`htmlTail`; that string
exists in no commit, branch, or stash. The repository version would have logged
SUCCESS with `parkId: "unknown"` for the same response.

## 2. Goals

1. Guest parking registration works again on iOS and Android, through ParkEaz's
   own pages, with the user present.
2. The user does the minimum: open the app from a push and tap once.
3. The app never misrepresents coverage. If the plate is unregistered, the
   screen says so and since when.
4. Convex stops making requests to ParkEaz.
5. Ship as one release on both platforms (iOS update plus first Android
   production release).

## 3. Non-goals

- Unattended renewals of any kind. No CAPTCHA-solving services, no headless
  browsers, no token farming. Out of scope by decision on 2026-10-31.
- Overnight coverage. Daily mode only; see §5.1.
- Supporting properties or zones other than 622 / Ponce Springs Lofts.
- Replacing ParkEaz's UI with a native form. The WebView shows ParkEaz's page.

## 4. Decisions already made (2026-10-31)

| Decision | Choice | Rejected alternatives |
|---|---|---|
| Extended Stay mode | Removed | "Nag me" mode; quiet-hours mode |
| Missed renewal tap | Session stays active, shows gap, one reminder, keeps asking on next open | Escalating pushes every 15 min; end session as lapsed |
| Release sequencing | Hold Play submission, ship option C to both platforms together | Submit Play now; iOS hotfix first |
| Where the CAPTCHA is solved | In-app WebView on ParkEaz pages | Token handoff to Convex; hand off to system browser |
| Which button the user taps | "Register To Park" on `/checkout` (the commitment step) | Fully scripted taps; user taps both buttons |

## 5. Functional requirements

### 5.1 Modes

- FR-1 Daily is the only mode. Settings no longer offers Extended Stay.
- FR-2 The `mode` field stays in the schema as optional for existing documents.
  Any session or user document with `mode: "extended"` is treated as daily on
  read. A session whose `desiredEndTime` is `Number.MAX_SAFE_INTEGER` is
  migrated on first read to `now + 24h`, and the Home screen shows a one-time
  notice explaining the change.
- FR-3 The weekly check-in scheduler is removed. Existing scheduled check-ins
  are cancelled on migration.

### 5.2 Session lifecycle

A session covers up to 24 hours (`desiredEndTime`). Within it, each ParkEaz
registration covers 2 hours (`lastParkStart` to `lastParkEnd`).

- FR-4 New fields on `sessions`, all optional for backward compatibility:
  - `dueAt: number` — `lastParkEnd - 10 min`; when the renewal push fires.
  - `lapsedAt: number` — set when `lastParkEnd` passes with no newer
    registration; cleared on the next successful registration.
  - `duePushId`, `lapsePushId: Id<"_scheduled_functions">` — scheduled push
    handles, cancelled on success or cancel.
- FR-5 Derived display states, computed on the client from times, not stored:
  - Registered until HH:MM — `now < lastParkEnd`
  - Renewal due — `dueAt <= now < lastParkEnd`
  - Unregistered since HH:MM — `now >= lastParkEnd` and `lapsedAt` set
  - Done — `status === "completed"`
- FR-6 Starting a session no longer registers anything server-side. It creates
  the session document and immediately opens the renewal screen (§5.3). The
  session's first registration is the user's first tap.
- FR-7 A successful registration (§5.3) sets `currentParkId`, `lastParkStart`,
  `lastParkEnd`, `dueAt`, clears `lapsedAt`, schedules the due push and the
  lapse push, cancels any previous ones, and appends a `renewalLogs` row with
  `action: "registered"` and `source: "client"`.
- FR-8 At `desiredEndTime` the session becomes `completed` regardless of gaps.
  Pending pushes are cancelled.
- FR-9 `retryCount`, exponential backoff, `renewing` status, and `handleFailure`
  are removed. Failures are shown in the renewal screen and the user retries by
  tapping.
- FR-10 Cancel keeps its current behavior and also cancels due and lapse pushes.
- FR-11 Extend (+24h) keeps its current behavior.

### 5.3 Renewal screen

- FR-12 Route `app/renew.tsx` with `sessionId` param. Reachable from the due
  push, the lapse push, the Home screen action, and immediately after
  `sessions.create`.
- FR-13 The screen is a full-screen `react-native-webview` loading
  `https://paid.parkeaz.com/paid?zone=622&propertyid=202`, with a thin banner
  above it that tells the user what to do and shows elapsed seconds.
- FR-14 Injected script, keyed on `location.pathname`:
  - `/paid`: set `#zone` to 622, `#plate` to the session plate, check
    `#parktermsagreed`, click `#selecttime`. Google's script runs; a silent pass
    advances to `/select_product`, a challenge is shown to the user.
  - `/select_product`: set mobile, email, first name, last name from the
    session; set guest code from the user's stored value; leave
    `parkallowtextalert` as the page sets it; submit the form. Advances to
    `/checkout`.
  - `/checkout`: no changes. Banner reads "Tap Register To Park". The user taps.
  - Any other path: no injection.
- FR-15 Success detection: navigation to a URL whose path is
  `/successful_transaction` or whose query contains `parkid=`. The screen
  extracts `parkid` from the URL, and `parkend` from the page body via the same
  patterns the server used. If `parkend` is missing or unparseable, it uses
  `now + 2h` and logs `parkEndSource: "fallback"`.
- FR-16 On success the screen calls `sessions.recordRegistration(sessionId,
  parkId, parkStart, parkEnd, parkEndSource)` and navigates back to Home, which
  shows Registered until HH:MM.
- FR-17 (superseded 2026-11-13, before release: the guest code is property-wide and comes from the Convex env var `PARKEAZ_GUEST_CODE` via `config.getGuestCode`; users never enter it; `users.guestCode` is a dead optional field.) Original text: Guest code: new optional field `users.guestCode`. Entered once in
  Settings (and prompted in profile-setup if empty). Read by the client through
  `users.getProfile`. The `PARKEAZ_GUEST_CODE` env var is no longer read by any
  function. The code never appears in the app bundle.
- FR-18 Autofill is best-effort. If any expected element id is missing on a
  page, the script does nothing on that page and the banner switches to
  "ParkEaz changed their page. Fill it in by hand." The flow still completes
  through the user's own input and FR-15 still detects success.

### 5.4 Notifications

- FR-19 Due push at `dueAt`: title "Renew parking for {plate}", body "Tap to
  keep {plate} registered. Takes one tap." Tapping opens `app/renew.tsx` for
  that session. Only sent if the session is still `active` and no newer
  registration exists.
- FR-20 Lapse push at `lastParkEnd` if no newer registration exists: title
  "{plate} is unregistered", body "Open parkDaddy to re-register." Sets
  `lapsedAt`. Only one lapse push per gap. No further pushes until the user
  opens the app and registers again.
- FR-21 Success push (`notifyOnSuccess`) unchanged.
- FR-22 Expiry warning 15 minutes before `desiredEndTime` unchanged; its body
  no longer mentions automatic renewal.
- FR-23 The `extend_24h` notification action category and the `EXTEND_24H`
  response handler are removed. The `ALLOWED_NOTIFICATION_ROUTES` list gains
  `/renew`.

### 5.5 Home screen

- FR-24 Shows the derived state (FR-5) prominently, plus a primary action
  "Renew now" when state is Renewal due or Unregistered, and "Registered" with
  the time otherwise.
- FR-25 Copy anywhere in the app that promises automatic renewal is rewritten.
  Known locations: Home, start-parking, settings mode toggle, What's New sheet,
  store listing copy in `docs/store-listing.md`.

### 5.6 Server cleanup

- FR-26 Delete `convex/parkeaz.ts`. Remove `node-fetch`, `tough-cookie` and
  their type packages if nothing else imports them.
- FR-27 `convex/renewal.ts` reduces to: `recordRegistration` (or lives in
  `sessions.ts`), `completeAtDesiredEnd`, and the push schedulers. `tick`,
  `saveResult`, `handleFailure` are deleted.
- FR-28 `convex/cronHandlers.ts` and `convex/crons.ts`: any cron that calls
  `renewal.tick` is removed or repointed at a stale-session sweeper that only
  completes sessions past `desiredEndTime`.
- FR-29 Precondition for the first deploy: the deployed production source is
  recovered (Convex dashboard → Functions, or the machine that deployed it) and
  diffed against this repository so no deployed-only fix is lost.

## 6. Non-functional requirements

- NFR-1 iOS live users must not regress: existing active daily sessions keep
  working through the state migration without a forced sign-out or data loss.
- NFR-2 From push tap to "Registered until" with a silent CAPTCHA pass: under
  15 seconds on a mid-range phone and normal LTE.
- NFR-3 The WebView is only ever shown in the foreground after a user action.
  No background WebView, no scripted click on "Register To Park".
- NFR-4 No ParkEaz credentials or guest code in the JS bundle, logs, or Sentry
  breadcrumbs. Breadcrumbs may carry pathname and outcome only.
- NFR-5 Accessibility: the banner is announced on change (`AccessibilityInfo`
  on iOS, live region on Android); "Renew now" and "Register To Park" guidance
  are reachable by screen reader; the WebView content is ParkEaz's and out of
  our control.
- NFR-6 Observability: Sentry breadcrumbs `renew_page` (pathname,
  autofill: applied | skipped), `renew_result` (success | parkeaz_error |
  load_error | abandoned, elapsedMs). Sentry message on `parkEndSource:
  "fallback"`.

## 7. Error handling

| Situation | Behavior |
|---|---|
| WebView fails to load | Banner shows the error and a Retry button. No session change. |
| ParkEaz redirect with `ErrorMessage=` in URL | Banner shows the decoded message. Page stays. User can tap again or go back. |
| CAPTCHA challenge appears | Nothing to do; user solves it in the WebView. Banner: "Complete the check, then tap Register To Park." |
| Token expired (user idle over 2 min on `/checkout`) | ParkEaz shows its error. Banner: "Took too long. Tap Retry to start over." Retry reloads `/paid`. |
| App backgrounded mid-flow | On foreground, reload `/paid` and re-run autofill. |
| Success page without `parkend` | `now + 2h`, `parkEndSource: "fallback"`, Sentry message. |
| Autofill selector missing | FR-18. Script skips the page, banner asks for manual entry. |
| User leaves the screen before success | `renew_result: abandoned`. Session unchanged; Home shows the current derived state. |
| `recordRegistration` mutation fails | Banner: "Registered with ParkEaz but we couldn't save it. Confirmation {parkid}." Retry button re-sends the mutation with the same values. |

## 8. Data

Schema additions, all `v.optional`, per the project rule that required fields
fail deploy when existing documents lack them.

```
users.guestCode?: string              // e.g. "ABC123"
sessions.dueAt?: number               // epoch ms
sessions.lapsedAt?: number            // epoch ms
sessions.duePushId?: Id<"_scheduled_functions">
sessions.lapsePushId?: Id<"_scheduled_functions">
renewalLogs.source?: "server" | "client"
renewalLogs.parkEndSource?: "page" | "fallback"
```

Fields that become unused but stay for old documents: `retryCount`,
`renewingAt`, `scheduledFunctionId`, `weeklyCheckInId`, `mode`.

## 9. Acceptance criteria

- AC-1 Fresh install, profile with guest code, start session: renewal screen
  opens, autofill lands on `/checkout` with plate, contact fields, and guest
  code visible, user taps once, Home shows Registered until now+2h within 15 s.
- AC-2 Due push arrives 10 minutes before `lastParkEnd`; tapping it opens the
  renewal screen for the right session on cold start and warm start, iOS and
  Android.
- AC-3 Ignore the due push. At `lastParkEnd`, lapse push arrives once. Home
  shows Unregistered since HH:MM. No further pushes for the next 2 hours.
  Opening the app and renewing clears the gap and schedules the next due push.
- AC-4 Forced CAPTCHA challenge (test with a fresh device or VPN): challenge is
  visible and solvable inside the WebView, flow completes.
- AC-5 Modified page fixture with `#selecttime` renamed: autofill skips, banner
  shows manual instruction, manual completion still records the registration.
- AC-6 Existing user with `mode: "extended"` and an open extended session
  upgrades: session gets a 24h end, notice shown once, weekly check-in
  cancelled, no crash.
- AC-7 `convex/parkeaz.ts` gone; `grep -r parkeaz.com convex/` returns only
  comments; deploy succeeds against the recovered production source.
- AC-8 At `desiredEndTime` the session completes and no due or lapse push fires
  afterward.
- AC-9 Sentry shows `renew_result` breadcrumbs with no guest code, email, or
  phone values.
- AC-10 Unit tests: derived state function (FR-5) for every boundary;
  `recordRegistration` scheduling math; injected-script page detection against
  captured fixtures for `/paid`, `/select_product`, `/checkout`,
  `/successful_transaction`, and the broken-selector fixture. All pass in CI.

## 10. Testing

- Unit: pure functions for derived state, due/lapse times, URL success
  detection, `parkend` parsing. Jest with `jest-expo` (already configured).
- Injected script: run against jsdom with HTML fixtures captured from the
  probe (`/paid` already saved; `/select_product`, `/checkout`,
  `/successful_transaction` captured during implementation with a real
  registration). Assert the exact element ids and the no-op on the broken
  fixture.
- Device checklist: AC-1 through AC-5 and AC-8 on a physical iPhone and a
  physical Android phone. CAPTCHA behavior cannot be automated; the checklist is
  the gate.
- Regression: email sign-in fix from 2026-10-31 and Google SSO cold start stay
  in the checklist.

## 11. Release

- Version 3.3.0. iOS build number next; Android `versionCode` 4.
- New dependency: `react-native-webview` via `npx expo install`.
- One commit train. Play submission resumes with this build; re-check the data
  safety form (no new data types expected: ParkEaz page loads are third-party
  web content, already covered by "app interactions").
- Store listing and What's New copy updated per FR-25.

## 12. Risks

| Risk | Handling |
|---|---|
| ParkEaz changes ids or adds steps | FR-18 keeps the flow usable by hand. Fixtures make breakage visible in tests the moment they are refreshed. |
| Google challenges every attempt on some devices | AC-4 covers the solvable path. If a device is challenged on both buttons every time, cost is two extra taps, not failure. |
| Users dislike the 2-hour tap | Product reality of ParkEaz's change. Copy is honest. Option A (ask property management for an API or longer product) runs in parallel and is the only path back to unattended. |
| iOS push tap on cold start lands on Home, not the renewal screen | Reuse the pattern already proven for `oauth_callback` cold start; AC-2 tests cold start explicitly. |
| Deploy overwrites deployed-only fixes | FR-29 is a hard precondition. |

## 13. Open questions

None blocking. Assumptions stated here become requirements unless overridden:

- ParkEaz contact fields receive the Convex profile values already stored.
- Text alerts remain whatever the page defaults to.
- The guest code is entered by the user once in Settings; no central
  distribution.
