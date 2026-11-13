# Human-in-the-Loop Renewal: Device Checklist (3.3.0)

Spec: `.claude/plans/human-in-loop-renewal-design.md` (section 9 and 10). Run AC-1 to AC-5 and AC-8 on a physical iPhone and a physical Android phone. CAPTCHA behavior cannot be automated; this checklist is the gate.

## Builds under test

| Platform | Build id | Date | Device | OS  |
| -------- | -------- | ---- | ------ | --- |
| iOS      |          |      |        |     |
| Android  |          |      |        |     |

Tick the box only on pass. On fail, leave it unticked and write the device, OS, build id, and what happened in Notes.

## Acceptance criteria

- [ ] **AC-1** Fresh install with a guest-code profile, start a session: renewal screen opens, autofill reaches `/checkout` with plate, contact fields, and guest code visible, one tap registers, Home shows Registered until now+2h within 15 s.
  - How: Fresh install, sign in, Settings, enter guest code, Home, Park, complete the WebView with one tap on Register.
  - Result:
  - Notes:
- [ ] **AC-2** Due push arrives 10 minutes before `lastParkEnd`; tapping it opens the renewal screen for the right session on cold and warm start, iOS and Android.
  - How: Start a session and wait for the due push at parkEnd-10 min, or shorten the wait by patching `lastParkEnd` on the dev deployment; test tap from killed app and from background.
  - Result:
  - Notes:
- [ ] **AC-3** Ignore the due push: at `lastParkEnd` one lapse push arrives, Home shows Unregistered since HH:MM, no further pushes for 2 hours; renewing clears the gap and schedules the next due push.
  - How: Start a session, ignore the due push, wait past `lastParkEnd` (or patch it on dev), then renew from Home. Expect exactly one lapse push at `lastParkEnd`, Home showing "Unregistered since HH:MM", and no further pushes for the next 2 hours; then renew and confirm the gap clears and a new due push is scheduled.
  - Result:
  - Notes:
- [ ] **AC-4** Forced CAPTCHA challenge (fresh device or VPN): challenge is visible and solvable inside the WebView and the flow completes.
  - How: Force a challenge with a fresh device or a VPN exit in another country.
  - Result:
  - Notes:
- [ ] **AC-5** Page with `#selecttime` renamed: autofill skips, banner shows the manual instruction, manual completion still records the registration.
  - How: Serve or inject a page copy with `#selecttime` renamed (debug build or local proxy), then complete manually.
  - Result:
  - Notes:
- [ ] **AC-6** Existing user with `mode: "extended"` and an open extended session upgrades: session gets a 24h end, notice shown once, weekly check-in cancelled, no crash.
  - How: On the dev deployment, insert a session with `desiredEndTime: Number.MAX_SAFE_INTEGER` and `mode: "extended"` via `npx convex import --append`; open the app before and after the next sweep.
  - Result:
  - Notes:
- [ ] **AC-7** `convex/parkeaz.ts` is gone; `grep -r parkeaz.com convex/` returns only comments; deploy succeeds against the recovered production source.
  - How: On the dev deployment (`npx convex dev --once` already run): confirm `convex/parkeaz.ts` is absent, run `grep -r "parkeaz.com" convex/` and confirm only comments match, and confirm the Functions list in the dev dashboard has no parkeaz, `renewal:tick`, `sessions:retry`, or `users:updateMode`. Production deploy happens in Release order step 1, not here.
  - Result:
  - Notes:
- [ ] **AC-8** At `desiredEndTime` the session completes and no due or lapse push fires afterward.
  - How: Start a session with a short `desiredEndTime` (patch on dev) and watch past it for any due or lapse push.
  - Result:
  - Notes:
- [ ] **AC-9** Sentry shows `renew_result` breadcrumbs with no guest code, email, or phone values.
  - How: Complete one renewal, then trigger a `parkeaz_error` (e.g. submit the same plate twice) so an event exists; open that event in Sentry and confirm `renew_page`/`renew_result` breadcrumbs carry only pathname, autofill, result, elapsedMs: no plate, email, phone, or guest code.
  - Result:
  - Notes:
- [ ] **AC-10** Unit tests pass in CI: derived state boundaries, `recordRegistration` scheduling math, injected-script page detection against captured fixtures (`/paid`, `/select_product`, `/checkout`, `/successful_transaction`, broken-selector).
  - How: Run `npx jest` locally and confirm the CI run is green.
  - Result:
  - Notes:

## Release order

Run these in order, only after the checklist above is complete. This section is the release sequence, not a checklist item.

1. `npx convex deploy` (production), only after AC-1, AC-2, AC-3, AC-7, and AC-8 pass on the dev deployment.
2. Immediately run `npx convex run cronHandlers:sweep --prod`. This normalizes legacy sessions now instead of waiting up to 30 minutes for the cron: sessions recorded by the old server (parkId `unknown`, or no client-recorded registration) with a future `lastParkEnd` are marked lapsed now and get one lapse push.
3. iOS: submit 3.3.0 for review and release it manually once approved.
4. Android: upload the AAB per `docs/google-play-submission.md`.

Note: after step 1, 3.2.0 clients cannot register (the server-side registration they call is gone) until they update to 3.3.0. Keep the gap between step 1 and steps 3 and 4 short.

## Reviewer carry-forwards

- [ ] Hermes `Intl.DateTimeFormat` with `timeZone`, `formatToParts`, `hourCycle: "h23"` works on both platforms (the Eastern-time parser in `src/parkeaz/pages.ts` relies on it; jest ran on Node).
  - Result:
  - Notes:
- [ ] `onLoadEnd` fires for each ParkEaz redirect hop and the autofill runs on `/paid` and `/select_product` (watch the banner change to "Tap Register To Park").
  - Result:
  - Notes:
- [ ] reCAPTCHA `anchor`/`bframe` iframes load inside the WebView under the top-frame-only origin gating; a forced challenge (fresh device or VPN) is solvable in place; nothing opens Safari/Chrome during the flow.
  - Result:
  - Notes:
- [ ] iOS AppState sequence on return from background triggers exactly one reload only while on a ParkEaz page (not on the success page, not during saving).
  - Result:
  - Notes:
- [ ] Start a session and let it reach `desiredEndTime` while on the renew screen: confirm the behavior (redirect Home or server rejection) is sane.
  - Result:
  - Notes:
- [ ] Legacy Extended Stay session (patch a dev-deployment session to `desiredEndTime = Number.MAX_SAFE_INTEGER`) shows a clamped end time on Home and History before the sweep runs, the migration notice after, and no crash.
  - Result:
  - Notes:
- [ ] `StatusPill` renders correctly for an active session (its only remaining status).
  - Result:
  - Notes:

### Regression

- [ ] Email sign-in: each Clerk status path works on a build: complete, second factor via email code, forced new password, unsupported.
  - Result:
  - Notes:
- [ ] Google SSO cold start.
  - Result:
  - Notes:

## Fixture capture

The fixtures in `src/parkeaz/__fixtures__/` for `select_product.html`, `checkout.html`, and `successful_transaction.html` are synthetic. While running AC-1 on a device:

1. Attach Safari Web Inspector (iOS: Settings > Safari > Advanced > Web Inspector, then Safari > Develop > device) or Chrome remote debugging (`chrome://inspect`, Android with USB debugging) to the WebView.
2. On each of `/select_product`, `/checkout`, and `/successful_transaction`, copy the live document HTML (`document.documentElement.outerHTML`). Redact guest code, email, phone, and plate before saving.
3. Save into `src/parkeaz/__fixtures__/select_product.html`, `checkout.html`, and `successful_transaction.html`.
4. Run `npx jest src/parkeaz` and fix selectors in `src/parkeaz/pages.ts` if the real pages differ.

## expo-doctor output

Run on 2026-10-31 (`npx expo-doctor` 1.21.5). 17/18 checks passed, 1 failed check (patch-version mismatches on 11 expo packages, not addressed in this release):

```
Running 18 checks on your project...
17/18 checks passed. 1 checks failed. Possible issues detected:

✖ Check that packages match versions required by installed Expo SDK

Patch version mismatches
package                    expected  found
expo                       ~54.0.37  54.0.33
expo-auth-session          ~7.0.11   7.0.10
expo-constants             ~18.0.14  18.0.13
expo-crypto                ~15.0.9   15.0.8
expo-dev-client            ~6.0.21   6.0.20
expo-font                  ~14.0.12  14.0.11
expo-linking               ~8.0.12   8.0.11
expo-local-authentication  ~17.0.9   17.0.8
expo-notifications         ~0.32.17  0.32.16
expo-router                ~6.0.24   6.0.23
expo-web-browser           ~15.0.11  15.0.10

11 packages out of date.
Advice:
Use 'npx expo install --check' to review and upgrade your dependencies.

1 check failed, indicating possible issues with the project.
```
