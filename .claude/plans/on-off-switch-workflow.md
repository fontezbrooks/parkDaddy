# On/Off Switch + Extended Stay Mode — Implementation Workflow

> Execution plan derived from the locked spec and design. Branch: `feature/on-off-switch-for-parking-registration`. Drafted 2026-05-20.
>
> **Companion docs:**
> - Requirements spec: in chat history (locked after 2 brainstorm rounds; all open questions resolved)
> - Design: `.claude/plans/on-off-switch-design.md`

---

## Phase 0 — Pre-flight (5 min)

Before any code changes.

- [ ] Confirm on `feature/on-off-switch-for-parking-registration` branch.
- [ ] `npx convex dev` running in a terminal for live deploys against dev backend.
- [ ] Confirm Convex env vars match `.env` (especially `PARKEAZ_GUEST_CODE`).
- [ ] iOS simulator OR physical device wired up via `expo run:ios` so notification flows can be tested end-to-end.
- [ ] Note current `buildNumber` (currently 16) for the bump at the end.

**Checkpoint:** `npm run start` boots; existing parking flow works against dev Convex.

---

## Phase 1 — Backend foundation (additive, safe to deploy alone)

All changes are additive — old clients keep working. **Can deploy to prod independently** for risk reduction.

### 1.1 Schema additions
- File: `convex/schema.ts`
- Add `users.mode: v.optional(v.union(v.literal("daily"), v.literal("extended")))`.
- Add `sessions.mode: v.union(v.literal("daily"), v.literal("extended"))`.
- Add `sessions.weeklyCheckInId: v.optional(v.id("_scheduled_functions"))`.
- Run `npx convex dev` to verify schema validates.

**Acceptance:** schema deploy succeeds; existing documents load (optional fields tolerate missing values).

### 1.2 `users.updateMode` mutation
- File: `convex/users.ts`
- New mutation: throws if user has any session in {active, renewing, failed}; otherwise patches `mode`.
- Reuse the existing `getActive`-style lookup pattern from `sessions.ts`.

**Acceptance:** mutation visible in `api.users.updateMode`; manually invoke via Convex dashboard with an active session present → throws; with no active session → succeeds.

### 1.3 Read-site mode defaults
- Files: `convex/renewal.ts`, `convex/notifications.ts`
- Wherever `session.mode` will be read in Phase 2, add `(session.mode ?? "daily")` default reads. Land this BEFORE the conditional logic in Phase 2 so the read sites are ready.
- Pure refactor; no behavior change yet.

**Acceptance:** typecheck clean.

### Phase 1 checkpoint
- `npx tsc --noEmit` clean.
- Deploy `npx convex deploy` to dev.
- Smoke test: existing app version (currently shipped) still works against new backend — old `sessions.create` with `durationMinutes` still accepted (we haven't changed its signature yet).

---

## Phase 2 — Backend behavior (coordinates with client release)

These changes break old clients. **Do NOT deploy to prod until client is ready.** Keep on dev/staging backend until Phase 4 lands.

Phase 2 sub-items are independent and can land in any order.

### 2.1 `sessions.create` — relax signature, branch on mode
- File: `convex/sessions.ts`
- Drop `durationMinutes` arg.
- Read `user.mode ?? "daily"`.
- Daily: `desiredEndTime = now + 24h`; schedule expiry warning at `desiredEndTime - 15min`.
- Extended: `desiredEndTime = Number.MAX_SAFE_INTEGER`; schedule weekly check-in at `now + 7d`.
- Write `mode` to the new session record.
- Existing immediate `internal.renewal.tick` trigger stays.

**Acceptance:** can create session in both modes; correct scheduled functions enqueued (visible via Convex dashboard scheduled-functions table).

### 2.2 `sessions.extend` — immediate parkeaz + always +24h
- File: `convex/sessions.ts`
- Drop `additionalMinutes` arg.
- Throw if `session.mode === "extended"`.
- Advance `desiredEndTime += 86_400_000`.
- Reschedule expiry warning (existing pattern).
- **New:** `await ctx.scheduler.runAfter(0, internal.renewal.tick, { sessionId })` to trigger immediate parkeaz top-up per FR-5.

**Acceptance:** in a Daily session, calling `extend` fires a parkeaz call within seconds (visible in Convex logs as `[ParkEaz] renewalAction started`).

### 2.3 `sessions.cancel` — also cancel weekly check-in
- File: `convex/sessions.ts`
- Add `cancelScheduled(ctx, session.weeklyCheckInId)` alongside existing cancels.

**Acceptance:** cancelling an Extended Stay session removes the weeklyCheckInId scheduled function from the dashboard.

### 2.4 Renewal mode-aware short-circuits
- File: `convex/renewal.ts`
- `tick` line 43: gate `lastParkEnd >= desiredEndTime → completed` on `session.mode === "daily"`. Extended sessions never hit the cap.
- `saveResult` line 99: same gate.
- Read `session.mode ?? "daily"` for backwards compat with pre-feature sessions.

**Acceptance:** Extended Stay session whose renewal succeeds does NOT mark `completed`; Daily session still does at the 24h boundary.

### 2.5 `notifications.sendWeeklyCheckIn` — new + self-rescheduling
- File: `convex/notifications.ts`
- `internalMutation` analogous to `sendExpiryWarning`.
- Guard: skip if session no longer active or user `notifyOnExpiry` is false.
- Send push: title "Still parked?", body "Tap to confirm you're still using parkDaddy for this car.", route `/(tabs)`.
- **Self-reschedule:** at end of handler, `ctx.scheduler.runAt(now + 7d, internal.notifications.sendWeeklyCheckIn, ...)` and patch the new `weeklyCheckInId` onto the session.

**Acceptance:** firing the check-in once schedules the next one 7d out.

### 2.6 `notifications.sendExpiryWarning` — add notification category
- File: `convex/notifications.ts`
- Add `categoryIdentifier: "extend_24h"` to the `push` action payload via the `data` field (or a sibling field if Expo expects it elsewhere — confirm via expo-notifications docs during implementation).

**Acceptance:** the push payload sent to Expo includes the category identifier; visible in `console.log` of the outbound `messages` array.

### 2.7 `notifications.push` — propagate categoryIdentifier
- File: `convex/notifications.ts`
- Extend `push` action args to optionally accept `categoryIdentifier: v.optional(v.string())`.
- Include it in the outgoing Expo message if present.

**Acceptance:** payload to Expo includes the category when sendExpiryWarning provides one.

### Phase 2 checkpoint
- `npx tsc --noEmit` clean.
- All mutation signatures updated.
- DO NOT deploy to prod yet — old clients would break.
- Verify via Convex dashboard that scheduled functions enqueue/cancel correctly during dev testing.

---

## Phase 3 — Frontend components (parallel-safe with Phase 2)

Independent of backend; can develop alongside Phase 2.

### 3.1 `<ParkToggle>` component
- New file: `src/components/ParkToggle.tsx`.
- Props: `{ activeSession, onPark, onUnpark, busy }`.
- Three visual states driven by props: Off / Loading / On.
- Reuses existing `colors`, `typography`, `spacing`, `radius` theme tokens.
- No business logic; consumers wire the mutations.

**Acceptance:** Storybook-free visual check by rendering all three states on a scratch screen.

### 3.2 `<ModeToggle>` component
- New file: `src/components/ModeToggle.tsx`.
- Props: `{ mode, onChange }`.
- Segmented control: Daily | Extended Stay.
- Calls `users.updateMode` mutation passed via prop.
- Returns `null` when parent says hidden (parent gates on active-session presence per Q-C).

**Acceptance:** tapping a segment fires `onChange`; matches existing theme.

### 3.3 `<WhatsNewSheet>` component
- New file: `src/components/WhatsNewSheet.tsx`.
- Modal sheet (RN `Modal` or React Native bottom-sheet).
- Content: 3 bullets from the "What's New" copy in the design doc.
- Single "Got it" dismiss button.
- AsyncStorage key `parkdaddy.whatsNewVersion` for persistence.
- Reads `Constants.expoConfig?.version`; shown if stored value < current version.

**Acceptance:** first render shows sheet; dismissing writes the version; subsequent renders skip.

### 3.4 Delete `<DurationPresetGrid>`
- Defer until Phase 4 callers are removed.
- File: `src/components/DurationPresetGrid.tsx`.

**Acceptance:** file removed; no broken imports.

---

## Phase 4 — Wire frontend screens

Depends on Phase 2 backend signatures AND Phase 3 components.

### 4.1 `app/(tabs)/index.tsx` — home screen
- Add `<ParkToggle>` driven by `api.sessions.getActive` subscription.
- Add `<ModeToggle>` shown only when `activeSession === null`.
- Wire `onPark` → `sessions.create({ plate, makeModel, color })` (plate selection flow unchanged).
- Wire `onUnpark` → `sessions.cancel({ sessionId })`.
- Wire `<ModeToggle>` `onChange` → `users.updateMode`.
- Existing countdown, history preview, etc. stay.

**Acceptance:** home screen renders correctly in all four state combinations: (no session × Daily mode), (no session × Extended), (active session × Daily), (active session × Extended).

### 4.2 `app/start-parking.tsx` — start flow
- Drop `<DurationPresetGrid>` and the `selectedMinutes` state.
- Replace with `<ParkToggle>` set to On after plate submission, calls `sessions.create({ plate, ... })`.
- Simplify the summary view (no "estimated end time" since mode controls it server-side).

**Acceptance:** screen renders without the preset grid; submission works; routes back home on success.

### 4.3 `app/extend-duration.tsx` — extend flow
- Drop `<DurationPresetGrid>` and `selectedMinutes`.
- Replace with a single "Extend 24h" button that calls `sessions.extend({ sessionId })`.
- Read `?autoExtend=1` query param; if present, trigger the extend mutation immediately on mount and route home on success (for the notification-tap path).
- Hide the screen entirely if `session.mode === "extended"` — back-navigate to home with a brief toast.

**Acceptance:** manual tap works; `?autoExtend=1` path also works.

### 4.4 `app/_layout.tsx` — notification category + action routing
- Add `Notifications.setNotificationCategoryAsync("extend_24h", [{ identifier: "EXTEND_24H", buttonTitle: "Extend 24h", options: { opensAppToForeground: true } }])` near the existing `setNotificationHandler`.
- In `useNotificationObserver`, branch on `response.actionIdentifier`:
  - `"EXTEND_24H"` → route to `/extend-duration?sessionId=<id>&autoExtend=1`.
  - Default → existing route handling (notification body tap).
- Add `<WhatsNewSheet>` mount inside `RootLayoutInner` so it shows after auth context is ready.

**Acceptance:** simulator notification with EXTEND_24H action routes correctly; tapping notification body still goes to home.

### Phase 4 checkpoint
- All four files updated.
- `<DurationPresetGrid>` no longer imported anywhere — safe to delete (Phase 3.4).
- `npx tsc --noEmit` clean.
- App launches and home screen renders without crashes.

---

## Phase 5 — End-to-end manual verification

Run all 8 scenarios from the design doc. Each scenario logs verification in the PR description.

| # | Scenario | Verification source |
|---|---|---|
| 1 | Daily Park On → renewal → expiry warning → Extend via notification → another 24h cycle | Convex logs + on-device push |
| 2 | Daily Park On → wait 24h without extend → `completed` | Convex logs (`[Renewal] completed`) |
| 3 | Extended Stay Park On → no expiry warning fires | Convex scheduled-functions table empty for expiryWarning |
| 4 | Extended Stay weekly check-in → next check-in scheduled | Scheduled-functions table shows next entry 7d out |
| 5 | Mode toggle hidden during active session | Visual check on home |
| 6 | Old-app session in-flight → continues with original `desiredEndTime` | Test by creating session pre-deploy, then upgrading client |
| 7 | WhatsNewSheet shown on first launch only | AsyncStorage value persists |
| 8 | Park Off cancels weekly check-in | Scheduled-functions table loses the entry |

**Compress test time:** for #2 and #4, edit the Convex environment to use a shorter `BUFFER_MS` / weekly interval, then revert before deploy. Alternative: trigger the scheduled function manually via `npx convex run` if Convex supports it for internal mutations.

**Acceptance:** all 8 scenarios pass on iOS device. (Android is out of scope for this submission per current roadmap.)

---

## Phase 6 — Ship

### 6.1 buildNumber + version
- File: `app.json`
- `buildNumber`: 16 → 17.
- Consider whether `version` bumps to `3.1.0` (recommended — meaningful UX change) vs staying on `3.0.x`. Decide before EAS build.

### 6.2 Convex prod deploy
- `npx convex deploy` to prod.
- Verify on Convex dashboard that schema validates against prod data (no orphan optional fields cause issues).

### 6.3 EAS build + submit
- `eas build --platform ios --profile production`.
- After build completes, `eas submit --platform ios`.
- Include screen recording demonstrating: Park On → Park Off, Daily → Extend flow via notification, Mode toggle, WhatsNew sheet.

### 6.4 Post-ship monitoring
- Watch Sentry for crashes related to new notification action handler.
- Watch Convex logs for `sendWeeklyCheckIn` firings (first ones will appear 7 days after the first Extended Stay user opts in).

### 6.5 Follow-up PRs (deferred)
- Update `docs/docs/store-listing.md` to remove duration list and add mode mention.
- Run the throwaway 24h parkeaz experiment (separate workstream from this feature).
- Revisit History tab status labels (Q3 deferral from spec).

---

## Dependency graph

```
Phase 0 (pre-flight)
   │
   ▼
Phase 1 (additive backend) ──── can deploy to prod independently
   │
   ▼
Phase 2 (breaking backend) ──┐
                              │ both must land together
Phase 3 (components) ─────────┤
                              │
                              ▼
                         Phase 4 (wire screens)
                              │
                              ▼
                         Phase 5 (E2E test)
                              │
                              ▼
                         Phase 6 (ship)
```

Phase 2 sub-items (2.1–2.7) are independent of each other — can land in any order.
Phase 3 sub-items (3.1–3.3) are independent of each other — can land in any order.
Phase 4 sub-items (4.1–4.4) are independent of each other once Phases 2 + 3 are done — can land in any order.

---

## Quality gates

| Gate | Before | Criteria |
|---|---|---|
| Phase 1 → Phase 2 | After all Phase 1 tasks | `tsc` clean; old client still works against new backend |
| Phase 2 → Phase 4 | After Phase 2 + Phase 3 complete | `tsc` clean; backend signatures match client expectations |
| Phase 4 → Phase 5 | After Phase 4 complete | App launches; no console errors on home screen mount |
| Phase 5 → Phase 6 | After all 8 manual scenarios pass | PR description has verification log; biggest-risk surface (notification routing) verified on physical device |
| Phase 6 → done | After EAS submit | App Store Connect shows binary uploaded; Convex prod deploy successful |

---

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Notification action handler doesn't route correctly on iOS | Medium | Manual device test in Phase 5; design already falls back to opensAppToForeground=true so worst case is a clunky extra UI flash, not broken UX |
| Weekly check-in scheduling chain breaks if a check-in fails mid-handler | Medium | Wrap reschedule in `try/finally`; on failure, alert via Sentry rather than silently dropping the chain |
| Existing in-flight sessions misbehave due to missing `mode` field | Low | Read-site `?? "daily"` defaults in Phase 1.3 cover this; verify in Phase 5 scenario #6 |
| App Store reviewer flags the WhatsNewSheet as a payment / subscription prompt | Low | Copy contains no IAP language; standard "What's New" pattern Apple already approves |
| `Number.MAX_SAFE_INTEGER` for Extended Stay desiredEndTime confuses some UI date formatter | Low | Audit all `desiredEndTime` consumers in Phase 4 for safe rendering — never display this raw |

---

## Estimated effort

Rough swag, not contractual:

| Phase | Hours |
|---|---|
| 0 | 0.5 |
| 1 | 1.5 |
| 2 | 3 |
| 3 | 2 |
| 4 | 3 |
| 5 | 2 |
| 6 | 1 |
| **Total** | **~13 hours** |

Frontend wiring (Phase 4) and Phase 2 backend are the biggest unknowns. Notification action routing is the single trickiest sub-task.

---

## Next step

`/sc:implement` to execute Phase 1 first. Land it independently (additive, low risk), then continue with Phases 2–4 in a single integrated commit since they must release together.
