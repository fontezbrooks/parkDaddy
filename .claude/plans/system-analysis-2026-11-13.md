# parkDaddy full system analysis — 2026-11-13

Scope: whole system at `main` @ `ee87b31` (PR #5 merged). Infrastructure, release, backend, security, app UX, accessibility, code quality, testing. Read-only. Five domain reviews ran in parallel; this document re-ranks their findings against verified production state and keeps every finding in the appendices.

## 1. Executive summary

The 3.3.0 renewal design is sound where it matters: pure domain logic with tests, origin-gated WebView injection, ownership checks on every Convex function, allowlisted push routing, idempotent legacy sweep. Local gates are green: `tsc` clean, 188/188 jest, eslint 0 errors (excluding the local `Design_splash_screen/` folder), expo-doctor 18/18.

The problems sit at the edges and in operations:

1. **Production is mid-release and exposed.** The 3.3.0 Convex backend is already deployed to `resolute-hummingbird-508`, but no 3.3.0 store build exists. Every installed client is 3.2.0, which calls a backend that no longer renews for it. 13 of 14 production users have no guest code. No rollback step is documented.
2. **The ParkEaz guest code is in a public repo.** Two tracked plan docs carry it, since the first commit. The repo is PUBLIC.
3. **The app has no connection-failure state.** Offline or slow Convex/Clerk gives a permanent blank screen with no retry or sign-out.
4. **There is no dev environment.** Preview builds, `expo start`, and both `.env` files talk to production Convex with the live Clerk key.
5. **One real backend race.** `completeAtDesiredEnd` has no time guard, so an extend landing while the completion job runs still completes the session.
6. **No CI, no OTA, no alerting, no receipts.** Nothing blocks a merge; a ParkEaz DOM change needs a store review to fix; cron failures and push delivery failures are invisible.

Finding counts across the five reviews, after re-ranking: Critical 2, High 16, Medium 44, Low 54.

## 2. Verified production state

| Fact | Evidence |
|---|---|
| Convex prod runs the 3.3.0 backend | `npx convex function-spec --prod` lists `cronHandlers:sweep`, `sessions:recordRegistration`, `users:updateGuestCode`; no `renewal:tick`, `sessions:retry`, `parkeaz:*` |
| No 3.3.0 store build | `eas build:list`: only 3.3.0 artifact is an iOS development (simulator) build, 2026-11-12. Production builds are 3.2.0 (iOS build 20, Android versionCode 3) |
| Users | 14 total, 1 with `guestCode` |
| Sessions | 74; 3 active (2 with `currentParkId: "unknown"`, 1 lapsed), 22 completed, 49 cancelled; 10 distinct users |
| Renewal logs | 855; 793 legacy server renewals, 31 failures, 1 `registered/client` on 2026-11-13 |
| Push tokens | 11, all iOS, one per user |
| Convex prod env | `CLERK_JWT_ISSUER_DOMAIN`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `PARKEAZ_GUEST_CODE` (legacy; unused by current code) |
| EAS env (preview and production) | `EXPO_PUBLIC_CONVEX_URL` = prod, Clerk `pk_live_`, `SENTRY_DISABLE_AUTO_UPLOAD=true` |
| Repo | PUBLIC (`gh repo view`); guest code string in `.claude/plans/parkdaddy-prd-v4.md` and `parkdaddy-system-design.md`, present since commit `52aedda` |
| Convex prod logs | silent over a 40 s window |
| Dependencies | `npm audit --omit=dev`: 3 critical, 22 high, 33 moderate, 2 low; mostly build-time. Runtime-relevant: `@clerk/*` (authorization bypass advisories for features this app does not use), `query-string`/`decode-uri-component` via `@react-navigation/core`, `ws` via `convex` (Node transport). `convex` 1.50 available within range |

## 3. Top findings, re-ranked

Severity here reflects impact on real users today, not the reviewer's local rating.

| # | Sev | Domain | Finding | Why it ranks here | Fix |
|---|---|---|---|---|---|
| 1 | Critical | Release | Backend 3.3.0 live, clients 3.2.0, no rollback, 13/14 users lack guest code | Live users cannot register at ParkEaz through the app. Window is bounded only by App Store review, and a rejection extends it indefinitely | Ship 3.3.0 to both stores now (production builds, manual release), or redeploy the pre-`75fdd30` Convex tree until builds are approved. Add a rollback line to the checklist. Message existing users about the guest code |
| 2 | Critical | UX | Offline / slow backend gives a permanent blank screen (`app/(tabs)/_layout.tsx:86`, `app/(auth)/_layout.tsx:14`, splash hard-timeout 5 s) | Parking app used outdoors; a dead screen with no retry or sign-out is a support ticket every time | Replace `return null` with a connection-state screen (spinner, then after ~8 s "Can't reach parkDaddy" with Retry and Sign out). Root `ErrorBoundary`. Keep splash up until data or error |
| 3 | High | Security | ParkEaz guest code committed in a PUBLIC repo since the first commit | Free registrations for anyone who reads git history; every user will type this value into the app | Ask the property to rotate; purge from the two docs and from history (`git filter-repo`), or make the repo private. Stop pasting live credentials into plans |
| 4 | High | Backend | `completeAtDesiredEnd` has no time guard (`convex/renewal.ts:190-205`) | The T-15 min expiry push invites a last-second extend; the already-running completion job then marks the extended session completed | `if (session.desiredEndTime > Date.now()) return;` mirroring `sendDuePush`/`markLapsed` |
| 5 | High | Infra | No dev environment: preview, `expo start`, `.env`, `.env.local` all hit prod Convex with the live Clerk key | Every test run touches real data; the dev deployment cannot be exercised from the app | EAS `development` environment pointing at `tidy-seal-196` with a Clerk dev instance; `environment:` per profile in `eas.json`; make `.env.local` URL match `CONVEX_DEPLOYMENT` |
| 6 | High | Auth | "Forgot password?" pushes the sign-in screen onto itself (`sign-in.tsx:459`); no reset flow exists | Locked-out users have no path back; error copy promises a reset | Implement `reset_password_email_code`, reuse `SignInCodeStep` then the existing `new_password` step; show the link on first failure |
| 7 | High | UX | Guest-code gating for upgraders is a silent redirect to Settings; field has no Save button and no saved feedback | This is the first thing 13 of 14 users will hit after updating | Dedicated guest-code sheet that explains why, saves explicitly, confirms, and returns to the originating action |
| 8 | High | Security | OAuth callback accepts any `parkdaddy://oauth_callback?rotating_token_nonce=` on a signed-out device (`app/oauth_callback.tsx:49-57`) | Login CSRF: victim signed into attacker's account, then enters plate/phone/guest code there | Bind the cold-start exchange to a value persisted before the Custom Tab opens; consider Android App Links |
| 9 | High | Privacy | Push token not removed on sign-out, deduped only per user (`convex/pushTokens.ts`) | Shared device: next account receives the previous account's plate pushes | `by_token` index, delete other users' rows on save, `remove` mutation called before `signOut` |
| 10 | High | Privacy | Sentry `sendDefaultPii: true` + mobile replay + `enableLogs` on an app whose main screen autofills plate, phone, email; privacy policy says "no analytics" | Policy, data-safety CSV, and code disagree; replay masking of WebView content unverified | `sendDefaultPii: false`; `Sentry.Mask` the renew screen or drop replay; scrub in `beforeSend`; rewrite policy §2.4 and §4 |
| 11 | High | Infra | No CI; `appVersionSource: local` + `autoIncrement` means next builds are iOS 21 / Android 5 and the bump will not persist from CI | Docs say 20/4; nothing blocks a broken merge | Workflow in Appendix D; switch to `appVersionSource: remote` |
| 12 | High | Code | Sign-up OTP can submit the same code twice (`OtpInput.tsx:37-39` effect + no in-flight guard in `sign-up.tsx`) | Clerk rejects the second attempt; user sees an error on a correct code | Fire `onComplete` from `handleChange`; add the `verifyInFlightRef` sign-in already has |
| 13 | High | UX | Legacy Extended Stay sessions show "Invalid Date" in extend-duration (`extend-duration.tsx:27`) | 2 of the 3 live production sessions are legacy | Use `coverageEndFor` and `deriveSessionState` |
| 14 | High | A11y | `onSurfaceMuted` (~2.6:1) and `accent` (~2.9:1) fail AA on 11-13 px text across Home, Settings, History, FormField | Every kicker and helper string | Darken `onSurfaceMuted` to ~`#6f7174`; move kickers off accent |
| 15 | High | UX | What's New modal renders over the splash, shows on fresh installs, names controls that do not exist ("Park On/Off") | First impression of 3.3.0 | Gate on `appReady && profile` and a stored previous version; rewrite bullets to match labels |
| 16 | High | Auth | "Use Face ID" only focuses the password field; label hard-coded on Android | Fake feature | Remove, or make it real via SecureStore-backed credential |
| 17 | High | UX | Profile setup has no back or sign-out | Wrong Google account = stuck | "Not you? Sign out" link |
| 18 | High | Ops | Push delivery single-attempt, receipts never fetched; no alerting on cron failure | The product's one signal (the due push) can drop silently | Bounded retry via `runAfter`; receipt check ~15 min after send; Convex log stream with alert |

## 4. Domain scorecards

| Domain | Grade | One line |
|---|---|---|
| Backend correctness | B | Core lifecycle verified safe (see Appendix A non-issues); one real race; unbounded `.collect()` on four user queries |
| Security | B- | Injection, auth, routing all sound; edges leak (public repo secret, OAuth nonce, token hygiene, Sentry PII) |
| App UX | C | Best-engineered part is the renew flow; worst is everything around connectivity, onboarding of the guest code, and dead-end screens |
| Accessibility | C- | Contrast failures, unlabeled countdown, three screens with zero a11y props, sub-44 pt targets |
| Infra / release | D | No CI, no dev env, no OTA, no alerting, iOS-only scripts, mid-release exposure |
| Testing | C | Pure logic near 100%; Convex, hooks, screens at 0%; fixtures synthetic |
| Code quality | B- | Clean types and lint; duplication (5 back buttons, 4 CTA styles), raw `err.message` to users, console calls shipped |

## 5. Roadmap

**P0, this week (stop the bleeding)**
- Build and submit 3.3.0 to both stores, or roll Convex back. Add rollback to the checklist.
- Rotate or confirm the guest code; purge it from the repo and history; make the repo private.
- Time guard in `completeAtDesiredEnd`.
- Connection-state screen replacing the two `return null`s.
- Guest-code onboarding sheet (explain, save, confirm, return).
- Sentry: `sendDefaultPii: false`, mask or exclude renew screen.

**P1, next two weeks (make the next release safe)**
- Dev environment (EAS `development` env, Clerk dev instance, matching `.env.local`).
- CI workflow (Appendix D) with branch protection; `appVersionSource: remote`.
- Password reset flow; OTP double-submit fix; profile-setup exit; What's New gating and copy.
- Push token `remove` + `by_token`; OAuth nonce binding; `Linking.openURL` scheme allowlist.
- Push retry + receipts; Convex log stream and alert.
- Paginate `listHistory`; `.first()` in `getLastParked`; server-side `parkEnd` bounds.
- Privacy policy rewrite to match code and the Play data-safety CSV.
- `npm i convex@^1.50`; remove `expo-server-sdk`, `utf-8-validate`; bump `@clerk/clerk-expo`.

**P2, next release (3.4.0)**
- `expo-updates` with `runtimeVersion: { policy: "appVersion" }`; channels per profile. ParkEaz DOM changes become OTA fixes.
- convex-test (Vitest, edge-runtime) for the P0 behaviors in Appendix E; `@testing-library/react-native` for `useRenewFlow`, notification routing, push registration.
- Capture live ParkEaz fixtures (dev-only outerHTML bridge, scrub script, provenance README).
- Contrast tokens; a11y props on start-parking, confirm-stop, extend-duration, FormField, switches; 44 pt targets.
- Delete the 30-minute sweep cron after a soak week, or paginate it.
- Shared `BackLink`, `FormError`, `PrimaryCta`, `useCountdown`; `copy.ts` for property name and taglines.
- Splash: cut Stage A minimum to ~500 ms, skip Stage B when ready; drop the unused Inter weights.
- README, LICENSE, remove `docs/errors.log`, gitignore `.superpowers/`, fix Play doc versionCode text.

**Deferred / judgment calls**
- Expo SDK 54 → 58 upgrade after 3.3.0 settles.
- Due/lapse pushes ignore `notifyOnExpiry`/`notifyOnSuccess`: decide whether they are mandatory and document it.
- `getDetail` has zero callers and `renewalLogs` never prunes: delete or add retention.
- Due/lapse copy says 15 min in Settings, 10 min in code and What's New: pick one.

---

## Appendix A — Backend review (convex/, src/domain)

Counts: Critical 0, High 1, Medium 6, Low 14.

| Severity | Area | Location | Finding | Recommendation |
|---|---|---|---|---|
| High | Race | `convex/renewal.ts:190-205` | `completeAtDesiredEnd` completes any `active` session without checking `desiredEndTime > now`; extend during a running completion job still completes | Add time guard or `scheduledForEnd` arg |
| Medium | Validation | `convex/sessions.ts:305-311`, `src/domain/renewal.ts:124-125` | Server accepts any `parkEnd > parkStart`; `now: null` plan fires elapsed times immediately, so a skewed client sends due+lapse at once | Bound `parkEnd` to `[now - skew, now + REGISTRATION_MS + slack]` server-side |
| Medium | Stuck state | `convex/sessions.ts:30,153,252` | Up to 30 min post-deploy, legacy `renewing`/`failed` sessions block `create` but are invisible to `getActive` | Include legacy statuses in `getActive` or normalize inline |
| Medium | Push delivery | `convex/notifications.ts:106-147` | Single-attempt send, no retry on fetch/429/5xx, no receipt check | Bounded retry via `runAfter`; receipt check |
| Medium | Push tokens | `convex/pushTokens.ts:4-39`, `settings.tsx:76` | Token stays bound to previous account after sign-out; same token can exist under two users | `by_token` index, cross-user delete on save, `remove` mutation |
| Medium | Receipts | `convex/notifications.ts:122-144` | `DeviceNotRegistered` only handled from tickets; most dead tokens arrive in receipts | Fetch receipts by ticket id after delay |
| Medium | Unbounded reads | `convex/sessions.ts:102-121,63-75,39-42,144-147` | `listHistory`, `getLastParked`, `getActive`, `getDetail` `.collect()` unbounded | Paginate `listHistory`; `.order("desc").first()`; `.take(n)` |
| Low | State guard | `sessions.ts:377-403` | `cancel` can flip a `completed` session to `cancelled` | Early-return on `isFinished` |
| Low | Arithmetic | `sessions.ts:350-351` | Extend adds 24 h to stored end even when already past; no cap | `Math.max(now, end) + 24h`; max horizon |
| Low | Logging parity | `cronHandlers.ts:101-122` | Sweep lapse path writes no `"lapsed"` log | Insert log |
| Low | Stale job | `renewal.ts:194`, `cronHandlers.ts:11-27` | Legacy session's completion job fires before reactivation; self-heals ≤60 min later | Treat `LIVE_STATUSES` as completable |
| Low | Cleanup | `users.ts:117-138` | `deleteAccount` cancels 3 legacy ids, not `duePushId`/`lapsePushId`/`completionId`; re-implements `cancelScheduled` | Cancel all six via helper |
| Low | Validation | `vehicles.ts:42-43`, `users.ts:18-24`, `pushTokens.ts:5-8`, `sessions.ts:284` | No max lengths; `platform` free string; `parkId` uncapped | Share `PLATE_PATTERN`; literal union; caps |
| Low | Prefs | `notifications.ts:44-72` | Due/lapse pushes ignore notification preferences | Decide and document |
| Low | Schema | `schema.ts:34,38,41-45,51,55` | `status` is `v.string()`; `retryCount` required but meaningless; six write-only legacy fields; `by_next_renewal` has no readers | Literal union; drop orphan index; plan migration |
| Low | Growth | `schema.ts:57-68`, `sessions.ts:129-151` | `renewalLogs` never pruned; `getDetail` has zero call sites | Delete `getDetail` or add retention |
| Low | Guidelines | `sessions.ts:26` et al. | Keys on `identity.subject` not `tokenIdentifier` | Fine with one issuer; note it |
| Low | Scale | `cronHandlers.ts:142-160` | Sweep does everything in one mutation | `.take(n)` + self-reschedule, or delete after soak |
| Low | Observability | `renewal.ts:21-25` | `cancelScheduled` swallows every error | `console.warn` with id |
| Low | Dead code | `notifications.ts:82,101-103`; `renewal.ts:158` | `categoryIdentifier` unused; `sendDuePush` name used for two roles | Remove / rename |
| Low | Testing | `convex/` | No convex-test for the four-function lifecycle | Add (Appendix E) |

Verified non-issues: recordRegistration vs completeAtDesiredEnd serialization; stale markLapsed no-op; no duplicate due/lapse across extend; no pushes after cancel; sweep idempotent on all five branches; concurrent `create` conflicts under OCC; cron definition compliant; validators on every function; `push` action uses `runQuery`/`runMutation` correctly; ticket array index-aligned; copy and routes consistent; server timestamps all epoch ms; `deleteAccount` cascade correct; `auth.config.ts` reads issuer from env.

## Appendix B — App UX, accessibility, code review (app/, src/components, src/hooks)

Counts: Critical 1, High 9, Medium 19, Low 13.

| Severity | Area | Location | Finding | Recommendation |
|---|---|---|---|---|
| Critical | UX | `app/(tabs)/_layout.tsx:86`, `app/(auth)/_layout.tsx:14`, `AnimatedSplash.tsx:85-97` | Offline/slow backend = permanent blank screen | Connection-state screen; root ErrorBoundary |
| High | Auth | `sign-in.tsx:457-468`, `clerkErrors.ts:20-23` | Forgot password pushes sign-in onto itself; no reset flow | Implement `reset_password_email_code` |
| High | UX | `index.tsx:42-50`, `start-parking.tsx:37-41`, `renew.tsx:52`, `settings.tsx:45-61,214-225` | Guest-code gate is a silent redirect; no Save; no feedback | Dedicated guest-code sheet |
| High | UX | `ActiveSessionHero.tsx:47-53,173-187`, `CountdownTimer.tsx:20` | Unlabeled 88 px `HH:MM` countdown reads as a clock time | Always label; format as "21h 13m" |
| High | UX | `WhatsNewSheet.tsx:17-34,40-53,65-69`, `_layout.tsx:148-149` | Shows over splash and on fresh installs; copy names non-existent controls | Gate on `appReady && profile` and prior version; rewrite |
| High | Code | `OtpInput.tsx:37-39`, `sign-up.tsx:82-108,166` | OTP double-submit | Event-driven `onComplete`; in-flight ref |
| High | Code | `extend-duration.tsx:27,85-91`, `StatusPill.tsx:10`, `renewal.ts:139-145` | "Invalid Date" for legacy sessions; pill always "ACTIVE (REGISTERED)" | `coverageEndFor`, `deriveSessionState` |
| High | A11y | `theme/colors.ts:6,15` and 9 usage sites | `onSurfaceMuted` ~2.6:1, `accent` ~2.9:1 on small text | Darken; move kickers to primary |
| High | Auth | `sign-in.tsx:275-280,470-482` | "Use Face ID" only focuses the password field; hard-coded label | Remove or make real |
| High | UX | `profile-setup.tsx`, `(auth)/_layout.tsx:28` | No back/sign-out | Add "Not you? Sign out" |
| Medium | UX | `useRenewFlow.ts:117-119`, `renewFlow.ts:151` | "Registered." never seen; replaced same tick | Delay ~800 ms with check + haptic, or Home toast |
| Medium | UX | `_layout.tsx:89,97-102` | Warm push tap while on `/renew` pushes a second renew | `navigate`/`replace` or pathname check |
| Medium | UX | `useRenewFlow.ts:124-140,231-234` | Foreground reload on checkout can lose an in-flight registration | Reload only `paid`/`select_product` or when stale |
| Medium | UX | `renewFlow.ts:276-284`, `RenewScreen.tsx:16-21,31-47` | Android allows every top-frame load; no WebView back | Back button; iOS "Opened in Safari" note |
| Medium | Code | `start-parking.tsx:53`, `extend-duration.tsx:38`, `confirm-stop.tsx:29-31`, `profile-setup.tsx:82,93`, `settings.tsx:58,104` | Raw `err.message` shown | Route through `mapConvexError` |
| Medium | Auth | `GoogleSignInButton.tsx:33-41`, `AppleSignInButton.tsx:28-36` | SSO failures console-only; cancel and failure indistinguishable | `onError` prop; Sentry |
| Medium | UX | `settings.tsx:237-243,261-268`, `usePushTokenRegistration.ts:19-25,44` | Copy says 15 min, code 10; "Renewal alerts" described as success; permission never surfaced | Fix copy; prime permission; denied-state row |
| Medium | UX | `_layout.tsx:143-146`, `confirm-stop.tsx:102-107` | Transparent-dialog styling on an opaque modal | `transparentModal` |
| Medium | A11y | start-parking, confirm-stop, extend-duration, `FormField.tsx:29-58`, `settings.tsx:246-258`, `sign-up.tsx:324-336` | Zero a11y props on three screens; labels not associated; switches/links unlabeled | Add role/label/state |
| Medium | A11y | `settings.tsx:175-203`, `FormField.tsx:73-85`, `confirm-stop.tsx:85`, `(tabs)/_layout.tsx:42-45` | Targets < 44 pt; tab labels 10 px fixed | `minHeight: 44`; scale labels |
| Medium | Code | `start-parking.tsx:37-41,50-51` | Push into tabs from root stack; `dismissAll` + `replace` back-to-back | Single `replace` |
| Medium | Code | sign-in, sign-up, SignInCodeStep, index, hero, welcome, history | 5× back button, 2× resend cooldown, 4× error box, 4× CTA style, hard-coded property name | Extract shared components; `copy.ts` |
| Medium | Perf | `AnimatedSplash.tsx:27-30`, `_layout.tsx:155-167` | ≥2.4 s artificial splash; 11 font weights | Cut Stage A to ~500 ms; skip B when ready; drop Inter |
| Medium | Code | `_layout.tsx:39-49` | Sentry PII + replay on a WebView autofill app | `sendDefaultPii: false`; mask |
| Medium | UX | `oauth_callback.tsx:15,116,129` | Blank dark screen up to 8 s | Spinner + copy + retry |
| Medium | UX | `index.tsx:408` | 4+ vehicles: rest unreachable from Home | "See all" |
| Medium | Code | `settings.tsx:41-46` | Server re-emit overwrites edits; code cannot be cleared | Sync once; allow clear |
| Medium | UX | `profile-setup.tsx:166-180`, `renew.tsx:23` | Phone not validated | 10-digit / E.164 |
| Medium | Auth | `settings.tsx:96-98` | Convex deleted before Clerk; failure orphans the account | Clerk first or server action |
| Low | UX | `index.tsx:30-39,184` | "Last parked · 5m ago" never ticks | `useNow` or absolute |
| Low | UX | `history.tsx:41-43` | Raw enum for unknown status | Map all |
| Low | Code | `welcome.tsx:114-126` | Unreachable "Resume" branch | Remove |
| Low | UX | `index.tsx:117-121` | Migration notice uses error styling | `InlineNotice` |
| Low | Code | `AnimatedSplash.tsx:116-124` | Dead callback | Delete |
| Low | Code | SSO buttons, `usePushTokenRegistration.ts` | `console.*` shipped | Sentry breadcrumbs |
| Low | Code | `sign-in.tsx:83-92`, `GoogleSignInButton.tsx:42-44` | setState after unmount | Cancel flag |
| Low | Auth | `clerkErrors.ts:16-19,40-43` | Email-specific copy for SMS; reveals account existence | Neutral copy |
| Low | UX | `sign-up.tsx:24-25` | Terms and Privacy same URL | Distinct docs |
| Low | Code | `StageA.tsx:21`, `BackgroundLayer.tsx:25` | `Dimensions.get` at module scope | `useWindowDimensions` |
| Low | A11y | `GradientButton.tsx:88,123-129` | Static loading dot | `ActivityIndicator` |
| Low | Code | `(auth)/_layout.tsx:22` | `as never` cast | Typed segment compare |
| Low | Code | `settings.tsx:66`, `WhatsNewSheet.tsx:38` | Version fallbacks differ | One constant |

Verified non-issues: Apple button hidden on Android; no auth redirect loop; cold-start push while signed out safe; push dedup and allowlist; all timers cleared; second factor covers email/SMS/TOTP with in-flight guard; renew params and WebView messages validated; History uses `SectionList`; reduced motion honored; font failure does not block; `hasGuestCode` tolerates undefined; banner announces on both platforms.

## Appendix C — Security review

Counts (reviewer): Critical 0, High 0, Medium 7, Low 10. Controller promoted #1 to High after confirming the repo is public and the string has been in history since the first commit.

| # | Sev | Category | Location | Finding | Remediation |
|---|---|---|---|---|---|
| 1 | High* | Secrets | `.claude/plans/parkdaddy-prd-v4.md:78,96,114`, `parkdaddy-system-design.md:614` | Guest code committed; repo PUBLIC; in history since `52aedda` | Rotate; purge docs and history; private repo |
| 2 | Medium | Auth | `app/oauth_callback.tsx:49-57,64,105-121` | Any `rotating_token_nonce` link on a signed-out device signs in (login CSRF) | Bind to pre-launch persisted state; App Links |
| 3 | Medium | Push/privacy | `convex/pushTokens.ts:19-38`, `settings.tsx:76` | Token not removed on sign-out; per-user dedupe only | `remove` + `by_token` |
| 4 | Medium | WebView | `renewFlow.ts:283`, `RenewScreen.tsx:13,38` | Android allows every navigation incl. http | Top-frame allowlist; block non-https |
| 5 | Medium | Privacy | `_layout.tsx:35-50` | `sendDefaultPii`, replay, logs; WebView masking unverified | Disable PII; mask; scrub |
| 6 | Medium | Policy | `docs/index.html` §2.4, §4 | "No analytics"; omits Sentry, guest code, Apple/email sign-in; disagrees with data-safety CSV | Rewrite; check which CSV was uploaded |
| 7 | Medium | Deps | `package.json` | 60 vulns; runtime-relevant: `query-string`, `@clerk/*`, `ws`, `nanoid`, `uuid` | Bump clerk-expo, expo-router; `npm audit fix` (no `--force`) |
| 8 | Low | WebView | `RenewScreen.tsx:19` | `Linking.openURL` with any scheme | Allow `https:`, `mailto:`, `tel:` only |
| 9 | Low | Injection | `useRenewFlow.ts:171-178` | Origin checked at `onLoadEnd`; redirect before `injectJavaScript` possible | `location.origin` guard as first line of script |
| 10 | Low | Deletion | `users.ts:118-138,167`, `settings.tsx:96-97` | Three job ids not cancelled; Convex before Clerk | Cancel all six; reorder |
| 11 | Low | Validation | `users.ts:19-24`, `vehicles.ts:27-30` | No length/format limits | Add |
| 12 | Low | Trust | `sessions.ts:281-333` | Client-supplied parkId/parkStart/parkEnd unverified | Bound server-side |
| 13 | Low | Push | `notifications.ts:107-111` | Expo push access token not enforced | Enable |
| 14 | Low | Hygiene | `.gitignore` | `.env.production` / `.env.development` not ignored | `.env*` with `!.env.example` |
| 15 | Low | PII | `eas.json` | Apple ID email, ASC id, team id committed | EAS secrets |
| 16 | Low | Deps | `package.json` | `expo-server-sdk`, `utf-8-validate` unused | Remove |
| 17 | Low | Hygiene | `docs/errors.log` | Tracked log from another app | Delete |

Verified non-issues: script injection safe (JSON.stringify + replacer, `injectJavaScript` not `<script>`); no re-injection per navigation; `onMessage` origin-checked and type-validated; WebView flags default-safe; notification routing allowlisted; Convex auth complete, no HTTP actions; no secrets tracked; renew breadcrumbs carry no PII; tokens not logged; deletion cascade correct.

## Appendix D — Infrastructure, release, ops review

Counts: Critical 0, High 3, Medium 9, Low 6. Controller promoted release exposure to Critical given verified production state.

| # | Sev | Area | Finding | Recommendation |
|---|---|---|---|---|
| 1 | Critical* | Release | Convex deployed first; 3.2.0 clients cannot register; no rollback; window unbounded by review | Submit stores now; rollback line; or additive deploy |
| 2 | High | Versioning | `appVersionSource: local` + `autoIncrement`: next builds are 21/5, bump will not persist from CI | `appVersionSource: remote` |
| 3 | Medium | Apple | 3.3.0 build 20 vs 3.2.0 build 20: not a collision (uniqueness is per version train; 3.3.0/20 never uploaded) | None beyond #2 |
| 4 | High | Environments | No dev env; all configs hit prod with live Clerk | EAS `development` env; per-profile `environment:` |
| 5 | Medium | Sentry | Source maps not uploaded; no `environment`/`release`/`dist`; no tracing | Enable upload with EAS secret; tag env/release; `tracesSampleRate: 0.1` |
| 6 | Medium | Privacy | `sendDefaultPii` + replay | Disable PII; mask; scrub |
| 7 | Medium | CI | No CI, no pre-commit; `eslint .` red locally only because of `Design_splash_screen/` | Workflow below; eslint ignore |
| 8 | Medium | Android | All scripts iOS-only; `publish` runs `prebuild` needlessly; no Android submit config | Add Android scripts; fill `submit.production.android` |
| 9 | Medium | Observability | No log stream, no alert, no renewal-success metric, no receipts | Log stream + alert; receipt check; `renewalLogs` query |
| 10 | Medium | Cost | 30-min sweep forever, single mutation | Delete after soak or paginate |
| 11 | Low | Cost | Replay 10% of sessions + logs | 0-5% |
| 12 | Medium | Deps | `expo-server-sdk`, `utf-8-validate` unused; `expo-dev-client` in prod deps | Remove; reconsider |
| 13 | Medium | Deps | Transitive critical/high; `convex` 1.50 available | `npm i convex@^1.50`; triage rest |
| 14 | Low | Deps | SDK 54 four majors behind | Upgrade after 3.3.0 |
| 15 | Low | OTA | No `expo-updates`; ParkEaz DOM changes need store review | Add with 3.4.0 |
| 16 | Low | Hygiene | No README/LICENSE; `docs/errors.log`; `.superpowers/` not ignored; Play doc mixed versions | Fix |
| 17 | Low | Secrets | `PARKEAZ_GUEST_CODE` plain-visible in EAS env and Convex env, now legacy | Mark secret; remove |
| 18 | Low | Config | Apple ID in `eas.json`; eas-cli outdated | Optional |

Proposed `.github/workflows/ci.yml` (assumes `Design_splash_screen/` added to eslint ignores):

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
    tags: ["v*"]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx eslint . --max-warnings 50
      - run: npx jest --ci
      - run: npx expo-doctor

  build:
    if: startsWith(github.ref, 'refs/tags/v')
    needs: verify
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: npm ci
      - run: eas build --platform all --profile production --non-interactive --no-wait
```

## Appendix E — Testing review

Coverage (statements / branches): `src/domain` 100/100; `src/notifications` 100/100; `src/parkeaz` 98.7/99.2; `src/utils` 39/40; `src/hooks`, `src/components`, `app/`, `convex/` all 0. Whole shipped surface roughly 15-20% of statements. 16 zero-coverage logic files.

Priority table:

| Priority | Module | Behavior to pin | Why | Type |
|---|---|---|---|---|
| P0 | `sessions.recordRegistration` | Rejects foreign/unauth, non-active, invalid args; writes nothing | Cross-user write | convex-test |
| P0 | `sessions.recordRegistration` | Same parkId twice = one log, one schedule | Duplicate pushes | convex-test |
| P0 | `renewal.markLapsed` / `sendDuePush` | Stale `scheduledForParkEnd` no-op; double-run = one push | False lapse push | convex-test + fake timers |
| P0 | `cronHandlers.sweep` | Idempotent; only legacy registrations get lapse push | Push every tick | convex-test |
| P1 | session queries | Per-user isolation | Data leak | convex-test `withIdentity` |
| P1 | `renewal.completeAtDesiredEnd` | Cancels all jobs; one end push; time guard (new) | Ghost pushes; the High race | convex-test |
| P1 | `notifications.*` | Owner tokens only; failure tolerant | Wrong recipient | convex-test, mocked fetch |
| P1 | `useRenewFlow` | Save error → failure; success only after ack | User believes renewed | renderHook |
| P2 | `extend` / `fillMissing` | Fill once, never in past | Missed reminder | convex-test |
| P2 | `_layout` routing | Cold-start push opens renew once | Tap goes nowhere | component |
| P2 | `clerkErrors` / `convexErrors` | Mapping + unknown shape | Raw errors | unit |

Approach: convex-test targets Vitest + `edge-runtime`; add `vitest.config.mts` scoped to `convex/`, devDeps `convex-test`, `vitest`, `@edge-runtime/vm`; Jest `testPathIgnorePatterns: ["/convex/"]`. `convex/_generated/api.d.ts` is newer than `api.js`: regenerate first. Estimated one day for harness plus P0 set.

Existing test gaps: synthetic fixtures prove self-consistency only; DST nonexistent hour 02:30 and ambiguous 01:30 untested; plausibility window tested only at upper bound; `SUCCESS_PROBE_SCRIPT` itself untested; malformed-HTML cases only for `/paid`; `process.env.TZ` never varied so "regardless of device zone" is unenforced. Run jest in CI under `TZ=UTC` and once under `TZ=America/New_York`.

CI gates: `tsc --noEmit`; eslint 0 errors; jest with `coverageThreshold` on `src/domain`, `src/parkeaz`, `src/notifications` at 95/90; global floor 15% as a tripwire only; Vitest for convex once it lands with a 60% floor rising.
