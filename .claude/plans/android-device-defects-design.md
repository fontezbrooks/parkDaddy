# Design: Android Device Smoke-Test Defects

**Status:** Design (2026-09-16). Awaiting approval, then `/sc:implement`.
**Requirements:** `android-device-defects-requirements.md` (same folder). FR/AC numbers below refer to it.
**Decision recorded 2026-09-16:** kill reason is device policy, not app fault (two logcat runs, both `Start proc … for next-top-activity`, no app-side cause). Build under test was an EAS `preview` APK. User chose the simple path: a real route at the redirect target so Unmatched Route never renders. Cold-path sign-in relies on Clerk's client reload, which the user has observed working; this design verifies it on device rather than re-implementing it.

## 1. Scope

| # | Change | Files | Requirement |
|---|--------|-------|-------------|
| C1 | Real adaptive launcher icon | `assets/android-icon-foreground.png` (new), `app.json` | FR-1, FR-2 |
| C2 | SSO callback route | `app/oauth_callback.tsx` (new) | FR-4, FR-5, FR-6b, FR-7 |
| C3 | Branded not-found screen | `app/+not-found.tsx` (new) | FR-8 |

No changes to `GoogleSignInButton.tsx`, `AppleSignInButton.tsx`, `_layout.tsx`, or iOS config. Both buttons keep `redirectUrl: Linking.createURL("oauth_callback")`; the route is created to match them, not the other way round. NFR-1 satisfied by construction.

## 2. C1 — Adaptive icon

### Bedrock numbers
- Adaptive icon canvas: 108 dp; Expo expects a 1024×1024 PNG. Safe zone is the centre 66 % = a 676 px circle. Artwork must stay inside that circle.
- Source `assets/parkDaddyIcon-nobackground.png` is 2048×2048 RGBA; artwork bounding box after trim is 1152×1244 px (portrait). Tallest side governs.
- Target artwork height on the 1024 canvas: **600 px** (58.6 % of canvas, comfortably inside 66 %, leaves visual breathing room under the circular mask). Width scales to ≈ 555 px.
- Background colour sampled from `assets/icon.png` field: **`#001840`** (rgb 0,24,64). Splash uses `#0f172a`; theme `primary` is `#000666`. `#001840` is the icon's own field, so the mask edge disappears; the small hue gap to the splash is not visible across a launcher→splash transition.

### Asset generation (one command, run once, output committed)
```
magick assets/parkDaddyIcon-nobackground.png -trim +repage \
  -resize x600 -background none -gravity center -extent 1024x1024 \
  assets/android-icon-foreground.png
```
Verify with `magick identify assets/android-icon-foreground.png` → `1024x1024 … 8-bit sRGBA` and `-trim` bbox height = 600.

### `app.json` change
```json
"android": {
  "adaptiveIcon": {
    "foregroundImage": "./assets/android-icon-foreground.png",
    "backgroundColor": "#001840"
  },
  ...
}
```
- `expo.icon` (`./assets/icon.png`) stays — it remains the iOS icon and the Android legacy (< API 26) fallback.
- `monochromeImage` intentionally omitted (requirements FR-3 decision: skip for first release).
- `assets/adaptive-icon.png` (placeholder) is deleted after a grep confirms nothing else references it. `assets/splash-icon1.png` (identical placeholder) is left alone; not this change's concern.

### Why not reuse `icon.png` directly
A full-bleed square as the foreground gets its corners cut by every mask and its navy field would double as background anyway. Transparent artwork + solid background is the construction Android's mask system assumes.

## 3. C2 — SSO callback route `app/oauth_callback.tsx`

### Behaviour contract
| Path | Trigger | What the route does | Who completes sign-in |
|------|---------|---------------------|-----------------------|
| Warm (process alive) | Expo Router navigates to `/oauth_callback` on the deep link while `startSSOFlow` is still resolving | Shows neutral screen; when `isSignedIn` flips true, replaces to `/(tabs)` | `GoogleSignInButton` (`setActive` + its own `router.replace`) |
| Cold (process dead, this device) | Launch intent URL = `parkdaddy://oauth_callback?rotating_token_nonce=…`; route is the initial route under the splash overlay | Detects an orphaned callback (no SSO flow was started in this JS runtime), performs the same exchange `useSSO` would have, then replaces to `/(tabs)` when `isSignedIn` flips | **This route** (revised 2026-09-20 after PR #4 review, see §6 R1) |
| Cancelled / failed | Custom Tab dismissed; on Android the route may or may not have been reached | If Clerk loads and `isSignedIn` stays false past a short grace period, replaces to `/(auth)/welcome` | nobody; user is back where they started |
| iOS | never reached (`ASWebAuthenticationSession` swallows the redirect) | n/a | unchanged |

### Rendering
Full-screen `View` with `backgroundColor: "#0f172a"` (same as splash) and nothing else. No text, no spinner. Rationale: on the cold path the splash overlay is on top for ≥ 1.4 s anyway; on the warm path the redirect fires within a frame or two of Clerk's `setActive`. Any text risks reading as an error (FR-8). A spinner is allowed if the grace period ever needs to be longer than ~2 s.

### Logic (pseudocode, not implementation)
```
auth = useAuth()                      // { isLoaded, isSignedIn }
GRACE_MS = 8000                       // named constant

effect [isLoaded, isSignedIn]:
  if !isLoaded: return
  if isSignedIn: router.replace("/(tabs)"); return
  timer = setTimeout(() => router.replace("/(auth)/welcome"), GRACE_MS)
  return () => clearTimeout(timer)    // cleanup on every dependency change and unmount
```
- Grace period exists only for the cancel/fail case. On success `isSignedIn` flips well inside it.
- Double `router.replace("/(tabs)")` on the warm path (button + route) is idempotent: same target, replace semantics. Verified acceptable; no guard needed.
- The effect must clear its timer in cleanup (see `~/.claude/skills/learned/empty-deps-useeffect-cleanup-trap.md`; this effect has dependencies, so cleanup runs on each change too, which is what we want).
- ~~Query params are deliberately not read.~~ **Revised 2026-09-20:** the route now completes the cold-start exchange. Added before the grace timer starts:
  ```
  orphaned = !hasStartedSsoFlow()          // src/utils/ssoFlowState.ts, one-way latch in JS memory
  nonce = routeNonce ?? nonce parsed from Linking.getInitialURL()   // fallback, strict hostname/path match
  if orphaned && nonce && not already claimed:
    claim nonce (module-level Set, single-use guard)
    signIn.reload({ rotatingTokenNonce: nonce })
    if signIn.firstFactorVerification.status === "transferable": signUp.create({ transfer: true })
    setActive({ session: signUp.createdSessionId ?? signIn.createdSessionId })
  then start grace timer (errors go to Sentry, timer still starts)
  ```
  The exchange is a line-for-line mirror of `@clerk/clerk-expo` 2.19.33 `useSSO` after `openAuthSessionAsync` resolves.

  **Why a latch, not the launch URL.** The question is "is a `startSSOFlow` promise still alive to consume this nonce?". `GoogleSignInButton` sets the latch just before calling `startSSOFlow`. The latch lives in JS memory, so it is lost in exactly the cases where the promise is lost (process death, JS runtime restart) and survives exactly where the promise survives (including Android destroying and recreating the activity under a live runtime, where the recreated activity's intent *is* the callback URL and a launch-URL check would wrongly claim the nonce and race the live promise). First revision used `Linking.getInitialURL()`; independent review flagged the race and it was replaced the same day. Apple button needs no latch: it returns early off iOS.

  Clerk's `signIn`/`signUp`/`setActive` are held in a ref so their identity changes during the exchange do not re-run the effect. Nonce is validated as a non-empty string ≤ 512 chars. A Sentry breadcrumb `sso_cold_start_exchange` marks the cold path (NFR-3).

### Registration
Expo Router picks the file up automatically. Root `Stack` in `app/_layout.tsx` already sets `headerShown: false` globally, so no `<Stack.Screen name="oauth_callback">` entry is needed. Adding one with `options={{ animation: "none" }}` is allowed if a push animation is visible on the warm path.

## 4. C3 — `app/+not-found.tsx`

Replaces Expo Router's default "Unmatched Route" for every unknown URL (FR-8). Content: the same neutral navy `View` as C2 plus `<Redirect href="/" />`. `/` resolves to `(tabs)/index`, whose layout guards already redirect to `/(auth)/welcome` or `/(auth)/profile-setup` as appropriate. No text, no links, no "Sitemap".

This is defence in depth: with C2 in place the SSO flow never hits it, but a mistyped notification `route` payload or a future stale link would.

## 5. Verification plan (AC mapping)

There is no test runner in the repo (no jest, no `test` script). Adding one for two screens that are pure navigation glue is out of scope; verification is on-device against the requirements' acceptance criteria. Each item is a pass/fail observation, recorded in the requirements doc §7 when done.

1. **AC-1 icon:** `eas build -p android --profile preview`, install, check launcher, drawer, recents, Settings → Apps. Both round and squircle masks (change launcher shape in device settings if available). Screenshot for the Play listing checklist.
2. **AC-2 warm/cold SSO, 3× consecutive:** tap Google → Custom Tab → return. Expect: splash (cold) → tabs. Never Unmatched Route.
3. **AC-3 fresh-install cold path, both branches:** uninstall, install, Google SSO with an account that has **never** signed up (sign-up branch → profile-setup), then sign out, sign in again (sign-in branch → tabs). This is the test that validates the cold-start exchange, especially the `transferable` sign-up branch. Confirm the `sso_cold_start_exchange` breadcrumb appears in Sentry. If either branch lands on welcome after the grace period, check Sentry for the captured exception from the exchange.
4. **AC-4 cancel:** open Custom Tab, press back. Expect sign-in screen, button enabled. Confirm no stray navigation after 8 s.
5. **AC-4b bogus deep link:** `adb shell am start -a android.intent.action.VIEW -d "parkdaddy://definitely-not-a-route"`. Expect navy screen then welcome/tabs, no text.
6. **AC-5 iOS unchanged:** run iOS simulator from the same commit, sign in with Google once, confirm icon and flow identical to build 18.
7. **AC-6 parent spec:** strike FR-2 (Android OAuth client) in `google-play-first-release-requirements.md` with a pointer to this doc.

## 6. Risks

- **R1 Cold-path sign-in — RESOLVED 2026-09-20.** Originally deferred: `useSSO` only completes the nonce reload inside its promise, and on the cold path nothing called it. PR #4 review (Codex, P1) flagged this, and reading `useSSO.js` showed the gap was worse than first written: for a never-used Google account Clerk returns `firstFactorVerification.status === "transferable"` and the user is only created by `signUp.create({ transfer: true })`, which also lives inside the dead promise. Returning users signed in via Clerk's client reload, which is what the device test observed; brand-new users would have bounced to welcome. The route now performs the full exchange on cold start (see §3 Logic). Residual risk: AC-3 has not yet been run on device against this revision.
- **R2 Grace-period misfire.** Slow network on the warm path could exceed 8 s and bounce a succeeding login to welcome. Mitigation: the button's own `router.replace("/(tabs)")` still fires when `setActive` resolves, so the user lands on tabs anyway; the bounce is a brief flash. Tune `GRACE_MS` upward if seen.
- **R3 Icon mask crop.** 600 px artwork height on a 676 px safe circle leaves 38 px margin top/bottom; the "P" is wider than tall at the top bar, so check the top-left corner of the P under the circular mask specifically (AC-1).
- **R4 Notification icon** still uses full-colour `icon.png` and will render as a blob on Android. Out of scope here; listed in the parent Phase 1 checklist under FR-4.

## 7. File list for `/sc:implement`

- `assets/android-icon-foreground.png` — new, generated by the §2 command.
- `assets/adaptive-icon.png` — deleted (after reference grep).
- `app.json` — two lines under `android.adaptiveIcon`.
- `app/oauth_callback.tsx` — new, ~135 lines after the 2026-09-20 cold-start revision.
- `src/utils/ssoFlowState.ts` — new, 13 lines, the in-memory latch.
- `src/components/GoogleSignInButton.tsx` — one import, one `markSsoFlowStarted()` call before `startSSOFlow`. No behavior change on iOS.
- `app/+not-found.tsx` — new, ~15 lines.
- `.claude/plans/google-play-first-release-requirements.md` — strike FR-2, correct §1 bullet 4 (android folder date), §7.1 (org account), §8 (gate does not apply).

Suggested commits, atomic: `fix(android): replace placeholder adaptive icon with brand mark`, `fix(auth): add SSO callback and branded not-found routes`, `docs: sync Play release plan with org account and device findings`.
