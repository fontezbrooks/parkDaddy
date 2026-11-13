# Turnstile auto-submit and variable coverage — design spec

Date: 2026-11-13. Branch: `fix/guest-code-source` (PR #7). Supersedes the reCAPTCHA and fixed-2-hour assumptions in `human-in-loop-renewal-design.md` (FR-9, FR-11, FR-14, the "2 h" copy). Everything else in that spec stands.

## 1. Problem

Two facts from the 2026-11-13 device run change the renewal model:

1. **ParkEaz replaced Google reCAPTCHA with Cloudflare Turnstile** on `/checkout`. Turnstile is a browser-side challenge that normally passes with no clicks (managed mode) and shows a checkbox only when unsure. It never shows image puzzles. The token lands in a hidden input named `cf-turnstile-response`, is single-use, lives about 5 minutes, and ParkEaz verifies it server-side. Today the user opens the app, waits for the widget to say "Success!", then taps **Register To Park**.
2. **Coverage is not always 2 hours.** Registrations made after 9:00 PM Eastern cover until a fixed 10:00 AM Eastern. Daytime registrations cover 2 hours. The checkout page shows the duration ("Time: 9 hours 44 minutes"). `parsePageParkEnd` rejects anything past now + 2 h 15 m, so every overnight registration falls back to now + 2 h: both production registrations on 2026-11-13 logged `parkEndSource: "fallback"`, and the user gets a false "renew" push at 1 h 50 m and a false "unregistered" at 2 h.

## 2. Goals

- G1 Remove the Register tap. After the challenge passes on the user's device, the app submits the form itself. The human still opens the app; the app still never solves or bypasses the challenge.
- G2 Record the real coverage end so pushes fire at the right time overnight.
- G3 Show the user what the registration covers before and after submit.
- G4 Keep a manual path: if auto-submit cannot fire, the existing "Tap Register To Park" flow still works.

## 3. Non-goals

- Unattended or background renewal. Turnstile needs a live WebView with the user present. Out of scope and not wanted.
- Any interaction with the Turnstile widget itself (no clicking its checkbox, no token reuse, no token forwarding off-device).
- Changing the 24-hour session model or the due/lapse push design.

## 4. Decisions

| Topic | Decision | Why |
|---|---|---|
| Submit trigger | Poll `input[name="cf-turnstile-response"]` every 250 ms; when its value is non-empty and the Register control is enabled, click it once | Token presence is the page's own signal that the challenge passed |
| Submit timeout | 90 s from checkout load, then stop polling and show the manual banner | Turnstile managed challenges finish in seconds; a checkbox variant waits for the user, who may be slow |
| Register control | `button, input[type=submit]` whose text or value matches `/register to park/i`; first match | No stable id is known yet (open question 1) |
| Once per page load | A `window.__parkdaddySubmitted` flag set before the click | Prevents a second submit on re-render or late poll ticks |
| Checkbox variant | No special handling: polling continues until the token appears, the banner says "Waiting for the human check…" | The user taps the Turnstile checkbox themselves; we only react to the token |
| Coverage end: source of truth | Success page text, as today, with the plausibility upper bound raised from 2 h 15 m to 13 h 15 m | Overnight registrations can span up to 13 h (9:00 PM to 10:00 AM) |
| Coverage end: fallback | Checkout "Time: X hours Y minutes" captured at checkout, else the clock model (section 6) | Degrades gracefully instead of lying |
| Clock model | After 21:00 Eastern and before 10:00 Eastern: end = next 10:00 AM Eastern. Otherwise end = now + 2 h | User's statement; 10 AM confirmed fixed |
| Top-frame allowlist | Add `https://challenges.cloudflare.com`; keep the Google and reCAPTCHA hosts until a live capture shows they are gone | Turnstile normally runs in an iframe (already allowed); some flows open it top-frame |
| Copy | "every 2 hours" becomes "every 2 hours, until 10 AM after 9 PM" | Matches real behaviour |
| Fixtures | Capture live `/checkout` (with the Turnstile widget markup) and `/successful_transaction` overnight and daytime; scrub PII | Existing fixtures are synthetic and reCAPTCHA-era |

## 5. Functional requirements

### Checkout auto-submit (`src/parkeaz/pages.ts`, new `CHECKOUT_BODY`)

- FR-1 On `/checkout` the injected script posts `{ type: "autofill", page: "checkout", result: "waiting" }` immediately, then polls for the Turnstile token.
- FR-2 When the token input exists and is non-empty, and the Register control exists and is not disabled, the script sets the once-flag, posts `result: "submitted"`, and clicks the Register control. The Register click happens at most once per page load.
- FR-3 If the Register control is not found within 2 s of load, the script posts `result: "skipped"` and stops. The banner falls back to "ParkEaz changed their page. Fill it in by hand."
- FR-4 If 90 s pass without a token, the script posts `result: "timeout"` and stops polling. A manual tap still works; nothing on the page is disabled by us.
- FR-5 The script never runs on a URL carrying `ErrorMessage`, never runs off `PARKEAZ_ORIGIN`, and never runs when the guest code is empty. These guards already exist in `injectionFor`/`buildInjection` and must still cover the new body.
- FR-6 The script also posts `{ type: "checkout_info", durationMs }` when it can parse "Time: N hours M minutes" (either part optional) from `document.body.innerText`. Absent or unparseable text posts nothing.

### Flow state (`src/parkeaz/renewFlow.ts`)

- FR-7 `autofill` results widen to `"pending" | "applied" | "skipped" | "waiting" | "submitted" | "timeout"`. `parseWebViewMessage` accepts the new values and rejects anything else.
- FR-8 A new `checkout_info` event stores `expectedEnd = now + durationMs` on the page state (`page: "checkout"`). It is dropped on any other step.
- FR-9 Banner copy for checkout:
  - `pending` or `waiting`: "Waiting for the human check…"
  - `submitted`: "Registering…"
  - `timeout`: "Tap Register To Park"
  - `skipped`: "ParkEaz changed their page. Fill it in by hand."
  - When `expectedEnd` is known, append " · Covers until {h:mm a}" in Eastern time, for example "Registering… · Covers until 10:00 AM".
- FR-10 `onSuccessPage` passes the checkout `expectedEnd` (if any) into `parsePageParkEnd` as a second fallback: page text first, then `expectedEnd`, then the clock model. `parkEndSource` widens to `"page" | "checkout" | "model"`; the existing `"fallback"` value is kept as an alias accepted by the schema for old rows.

### Coverage end (`src/parkeaz/pages.ts`, `src/domain/renewal.ts`)

- FR-11 `parsePageParkEnd(text, now, expectedEnd?)` trusts a page value when `now < parkEnd <= now + MAX_COVERAGE_MS + PARK_END_SLACK_MS`, with `MAX_COVERAGE_MS = 13 h`.
- FR-12 New pure function `modelCoverageEnd(now)` in `src/domain/renewal.ts`: in Eastern time, if the hour is 21 or later, or earlier than 10, return the next 10:00 AM Eastern as epoch ms; otherwise return `now + REGISTRATION_MS`. Uses the same `Intl`-based Eastern conversion as `pages.ts` (move the helpers to the domain module so both import them).
- FR-13 `REGISTRATION_MS` stays 2 h and is used only by the daytime branch of the model and by copy.

### Backend (`convex/`)

- FR-14 `renewalLogs.parkEndSource` validator accepts `"page" | "checkout" | "model" | "fallback"`. No other schema change. Pushes already key off `parkEnd`.
- FR-15 `sessions.recordRegistration` accepts `parkEnd` up to `parkStart + 13 h + 15 min` (this also closes the backend review's "server accepts any parkEnd" finding by adding the lower bound `parkEnd > parkStart` and an upper bound).

### WebView and origin (`src/parkeaz/renewFlow.ts`)

- FR-16 `TOP_FRAME_ALLOWED_ORIGINS` adds `https://challenges.cloudflare.com`.

### Copy (`src/components/home/ActiveSessionHero.tsx`, `src/components/WhatsNewSheet.tsx`, `app/(tabs)/settings.tsx`)

- FR-17 Every "every 2 hours" becomes "every 2 hours, until 10 AM after 9 PM". The due-push body is unchanged.
- FR-18 Home's registered state shows the real coverage end ("Registered until 10:00 AM") because it already reads `lastParkEnd`.

### Observability

- FR-19 Sentry breadcrumb `renew_checkout` with `{ submit: "auto" | "timeout" | "skipped", msToToken, durationParsed: boolean }`. No token value, no PII.
- FR-20 Breadcrumb `renew_result` gains `parkEndSource`.

## 6. Clock model, worked examples (Eastern)

| Registered at | Model end | Reason |
|---|---|---|
| 12:15 AM | 10:00 AM same day | hour < 10 |
| 9:05 PM | 10:00 AM next day | hour ≥ 21 |
| 2:00 PM | 4:00 PM | daytime, +2 h |
| 8:59 PM | 10:59 PM | daytime, +2 h |
| 9:30 AM | 10:00 AM (30 min) | hour < 10; see open question 2 |

DST: compute "next 10:00 AM Eastern" by walking the Eastern calendar date, not by adding hours, so the spring-forward and fall-back nights produce 10:00 AM wall-clock.

## 7. Error and edge table

| Condition | Behaviour |
|---|---|
| Turnstile checkbox shown | Banner "Waiting for the human check…"; user taps the checkbox; token appears; auto-submit |
| Token present but Register disabled | Keep polling until enabled or timeout |
| Register clicked, ParkEaz returns `ErrorMessage` | Existing `parkeaz_error` path; no re-submit on that URL |
| Token expired before click (user backgrounded the app for 5 min) | ParkEaz rejects; `ErrorMessage` path; Retry reloads the start URL |
| App foregrounded while on checkout | Existing `useForegroundReload` reloads; the once-flag resets with the page |
| Success text has no parseable end, checkout had "Time" | `parkEndSource: "checkout"` |
| Neither | `parkEndSource: "model"` |
| Page end outside (now, now + 13 h 15 m] | treated as absent; fall through |
| `/checkout` loaded directly from a push tap with a stale token | Same as fresh load; Turnstile re-issues |

## 8. Acceptance criteria

- AC-1 Daytime: tap the due push, no further taps, Home shows "Registered until" now + 2 h within 15 s, log `parkEndSource: "page"`.
- AC-2 After 9 PM: same, Home shows "Registered until 10:00 AM", no pushes overnight, due push at 9:50 AM.
- AC-3 Forced checkbox (toggle airplane mode or use a VPN): banner shows "Waiting for the human check…", one tap on the checkbox, then auto-submit.
- AC-4 Remove the Register control in DevTools before the token appears: banner shows "ParkEaz changed their page. Fill it in by hand.", nothing else happens.
- AC-5 Block `challenges.cloudflare.com` at the network: after 90 s banner shows "Tap Register To Park"; a manual tap still submits once the widget later succeeds.
- AC-6 Background the app on checkout for 6 minutes, foreground: page reloads, flow completes without a double registration.
- AC-7 `npx jest src/parkeaz src/domain` covers: token poll success, timeout, missing control, once-flag, "Time" parse variants (hours only, minutes only, both, absent), `modelCoverageEnd` for the five worked examples plus the two DST nights, `parsePageParkEnd` precedence (page, checkout, model) and bounds.
- AC-8 Sentry shows `renew_checkout` and `renew_result` with no token, email, phone, or guest code.

## 9. Testing

- Unit (jsdom): run `CHECKOUT_BODY` against a captured checkout fixture with a fake `cf-turnstile-response` input; use fake timers to drive the poll; assert exactly one click and the posted results in order.
- Unit: `modelCoverageEnd` table from section 6 with `process.env.TZ` varied across two jest runs (CI runs `TZ=UTC` and `TZ=America/New_York`).
- Device: AC-1 to AC-6 on the dev build against the dev deployment; AC-2 needs one real overnight run.
- Fixtures: replace `checkout.html` and `successful_transaction.html` with live captures, scrubbed. Note capture date and whether the Turnstile iframe markup is present.

## 10. Rollout

- Ships on `fix/guest-code-source` as part of 3.3.0 (no store build exists yet). No Convex schema migration; `parkEndSource` widening is additive.
- Convex deploy before the store build, as before.

## 11. Risks

- ParkEaz may rate-limit or flag instant programmatic submits. Mitigation: the click is a normal DOM click after a legitimately issued token, identical to a user tap; if rejections appear, add a 500 ms human-scale delay.
- The Register control selector is a guess until open question 1 is answered. Mitigation: text match plus the `skipped` fallback.
- The 10 AM rule is from one observation and the user's statement. Mitigation: the model is the last fallback; page text wins.

## 12. Open questions

1. Live `/checkout` capture: exact markup of the Register control and the Turnstile container (`cf-turnstile-response` is the Cloudflare default and may be renamed by the site). Needed before implementing FR-2.
2. Registrations between 8:00 AM and 10:00 AM: does ParkEaz give 2 hours or only until 10 AM? Decides the model's early-morning branch and the copy.
3. Does the overnight product appear on the `/paid` or `/select_product` step as a different product id, or is it the same product with a longer duration? Affects nothing today; worth knowing for the fixture set.
