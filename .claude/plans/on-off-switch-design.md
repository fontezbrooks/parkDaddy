# On/Off Switch + Extended Stay Mode — Design

> Implementation design for the locked requirements spec (2 brainstorm rounds, all open questions resolved). Branch: `feature/on-off-switch-for-parking-registration`. Drafted 2026-05-20.

## A-1 outcome: Notification action feasibility

**Investigated `expo-notifications` docs.** Findings:

- iOS: `setNotificationCategoryAsync` supports `opensAppToForeground: false`, but the action handler runs via `addNotificationResponseReceivedListener` which fires when the JS runtime gets a chance — i.e., when the app is foregrounded next. Background execution via `TaskManager.defineTask` exists but the doc explicitly notes Android-only ("Only on Android, the task also runs in response to a notification action tap when the app is backgrounded or terminated"). Locked-device behavior is undocumented.
- Android: TaskManager-backed handler can run from backgrounded/terminated states, but this requires the `expo-task-manager` integration and constraints (battery optimization, OEM background restrictions).

**Decision: ship the fallback per Q-D.** The Extend notification opens the app and the existing `addNotificationResponseReceivedListener` in `app/_layout.tsx` routes to the extend flow, which auto-triggers `sessions.extend` on entry. This is honest about behavior (user knows the tap "did something") and matches the locked spec's NFR-5 fallback.

**Implication for "What's New" copy:** drop "Tap right from the notification" wording. Replace with "Tap the notification to extend in one tap."

## Schema changes

Two additive fields. No data migration required — existing documents missing the new fields get safe defaults at read sites.

```ts
// convex/schema.ts (deltas only)
users: defineTable({
  // ...existing fields...
  mode: v.optional(v.union(v.literal("daily"), v.literal("extended"))),
}).index("by_clerk_id", ["clerkId"]),

sessions: defineTable({
  // ...existing fields...
  mode: v.union(v.literal("daily"), v.literal("extended")),  // required; written at create time
  weeklyCheckInId: v.optional(v.id("_scheduled_functions")),
}),
```

**Why `users.mode` is optional:** existing users have no mode field; default to `"daily"` at read sites.
**Why `sessions.mode` is required:** every new session writes it; old sessions (pre-feature) don't have it and we never read this field on them (they're already terminal).

## State machine

### Daily mode
```
┌────────┐  toggle on   ┌────────┐  parkeaz ok   ┌────────┐
│  off   ├─────────────►│renewing├──────────────►│ active │
└────────┘              └───┬────┘               └───┬────┘
     ▲                      │ parkeaz fail x4       │ next tick
     │                      ▼                        │
     │                  ┌────────┐                   │
     │                  │ failed │◄──────────────────┘
     │                  └────┬───┘                   │
     │ toggle off            │ retry                 │
     │                       │ desiredEndTime hit    │
     │ ┌─────────────┐       │ without extend        │
     └─┤ cancelled / │◄──────┘                       │
       │ completed   │◄──────────────────────────────┘
       └─────────────┘
```

### Extended Stay mode
Same diagram minus the `desiredEndTime → completed` branch. Renewal loop is open-ended; only `cancelled` or `failed` terminates.

### Key invariant changes
- `renewal.tick` line 43 short-circuit (`session.lastParkEnd >= session.desiredEndTime → completed`) **only fires when `session.mode === "daily"`**. In Extended Stay, `desiredEndTime` is set to `Number.MAX_SAFE_INTEGER` so the comparison never triggers (or we skip the check entirely when `mode === "extended"`).
- `renewal.saveResult` lines 99–119 same gate: only mark `completed` for Daily.

## Mutation / action signatures

### `sessions.create` — modified
```ts
args: {
  plate: v.string(),
  makeModel: v.optional(v.string()),
  color: v.optional(v.string()),
  // durationMinutes removed; mode read from user.mode
}
```
Behavior:
1. Read `user.mode ?? "daily"`.
2. Daily: `desiredEndTime = now + 24h`. Schedule expiry warning at `desiredEndTime - 15min`.
3. Extended: `desiredEndTime = Number.MAX_SAFE_INTEGER`. Schedule weekly check-in at `now + 7d`.
4. Write `mode` to the session record.
5. Trigger `internal.renewal.tick` immediately (unchanged).

### `sessions.extend` — modified (Daily only)
```ts
args: {
  sessionId: v.id("sessions"),
  // additionalMinutes removed; always +24h
}
```
Behavior:
1. Throw if `session.mode === "extended"` (in-app button is hidden but mutation must defend).
2. Throw if status ∉ {active, renewing, failed}.
3. `desiredEndTime += 86_400_000`.
4. Cancel existing `expiryWarningId`; schedule new one at new `desiredEndTime - 15min`.
5. **Trigger `internal.renewal.tick` immediately** for the parkeaz top-up call (matching initial register path per FR-5).

### `sessions.cancel` — extended
Cancel `weeklyCheckInId` in addition to existing `scheduledFunctionId` and `expiryWarningId`. Mark `cancelled` regardless of mode.

### `users.updateMode` — new
```ts
args: { mode: v.union(v.literal("daily"), v.literal("extended")) }
```
Behavior:
1. Throw if user has an active session (status ∈ {active, renewing, failed}) per Q-B.
2. Patch `user.mode`.

(Alternative: extend existing `users.updateNotificationPrefs` to accept mode. Cleaner as a separate mutation since the guard logic is different.)

### `notifications.sendWeeklyCheckIn` — new
`internalMutation` analogous to `sendExpiryWarning`. Honors `user.notifyOnExpiry`. Pushes "Still parked? Tap to confirm" with route `/(tabs)`. After scheduling the push action, schedule the **next** weekly check-in at `now + 7d` (recurring forever per Q-A.1.b).

### `notifications.sendExpiryWarning` — modified
Set `categoryIdentifier: "extend_24h"` so the iOS notification surfaces the Extend action button. Keep existing user-pref check.

## Frontend components

### `<ParkToggle>` — new
- Props: `{ activeSession: Session | null, onPark: () => void, onUnpark: () => void }`
- Visual states: Off / Loading / On.
- Loading driven by local React state during the create/cancel mutation in-flight.
- Once mutation resolves, switches to On (Convex subscription provides confirmation). If parkeaz fails (status `failed` arrives via subscription), shows error and reverts to Off-able state.
- Lives on home (`app/(tabs)/index.tsx`) and start-parking (`app/start-parking.tsx`). Same component, different surrounding chrome.

### `<ModeToggle>` — new
- Props: `{ mode: "daily" | "extended", onChange: (m) => void, disabled: boolean }`
- Visible only when no active session (`disabled` becomes `true` and the component returns `null` per Q-C: hide entirely, don't disable).
- Segmented control style.
- Calls `users.updateMode` on change.

### `<WhatsNewSheet>` — new
- Modal sheet, shown once on first launch of v3.1+.
- Gating: AsyncStorage key `parkdaddy.whatsNewVersion`. Read on `app/_layout.tsx` mount. If stored value < current app version (Constants.expoConfig.version), render sheet; on dismiss, write current version to key.
- Content: 3 bullet "What changed" copy plus a single dismiss button.

### `<DurationPresetGrid>` — DELETE
- Used only by `app/start-parking.tsx:153` and `app/extend-duration.tsx:110`. Both screens replace it with the toggle/button. Remove the file.

## Notification category registration

Add at app startup (in `app/_layout.tsx` alongside the existing `setNotificationHandler`):

```ts
Notifications.setNotificationCategoryAsync("extend_24h", [
  {
    identifier: "EXTEND_24H",
    buttonTitle: "Extend 24h",
    options: { opensAppToForeground: true },  // honest per A-1 finding
  },
]);
```

In `useNotificationObserver`, branch on `response.actionIdentifier === "EXTEND_24H"`:
- Route to `/extend-duration?sessionId=...&autoExtend=1` so the screen runs `sessions.extend` immediately on mount, then redirects home.

## Renewal cron / scheduled-function lifecycle

| Event | Daily | Extended Stay |
|---|---|---|
| Park On | Schedule renewal tick + expiry warning | Schedule renewal tick + weekly check-in |
| Renewal success (not at cap) | Reschedule next tick at `parkEnd - 10min` | Reschedule next tick at `parkEnd - 10min` (no cap) |
| Renewal success (at cap) | Mark `completed`, cancel expiry warning | N/A — cap never hit |
| Renewal failure (under retry budget) | Exponential backoff | Same |
| Renewal failure (over budget) | Mark `failed`, send urgent if <15min left, else send renewal failure | Same |
| Weekly check-in fires | N/A | Send push, reschedule next at `now + 7d` |
| User taps Extend | Trigger immediate `renewal.tick`, advance `desiredEndTime` | N/A — button hidden, mutation throws |
| User taps Park Off | Cancel tick + expiry warning | Cancel tick + weekly check-in |

## Migration / backwards compat

- Existing in-flight sessions pre-deploy have no `mode` field. They're already on the old `desiredEndTime`-capped flow; the renewal cron continues to honor their stored `desiredEndTime` until they hit it and mark `completed`. **Add a read-site default `session.mode ?? "daily"` in `renewal.tick`, `renewal.saveResult`, `renewal.handleFailure`, and `notifications.sendExpiryWarning`.** No data migration required.
- Existing users with no `mode` field default to Daily on read in the home-screen mode toggle.
- New `WhatsNewSheet` shows on first post-update launch even for users who started fresh on v3.1 (consequence: they see the sheet too). Acceptable trade for not having a "first-time user vs upgrading user" distinction.

## Performance / load

- Weekly check-in adds ~1 push per user per week for Extended Stay users. Negligible.
- Extend triggers immediate renewal tick → parkeaz HTTP call. Same load profile as initial Park On. No change to existing rate-limit posture.
- `users.updateMode` is a single doc patch. Negligible.

## Security / safety

- `sessions.extend` and `sessions.create` already gate on `ctx.auth.getUserIdentity()`. No change.
- `users.updateMode` adds an authorization check: throw if `user._id` doesn't match identity. Same pattern as `updateNotificationPrefs`.
- Notification action handler runs in JS (no privileged context). The mutation it triggers has the user's auth token from the existing Clerk → Convex chain. No new attack surface.
- Extended Stay weekly check-ins do not include vehicle plate or other PII in the body. Use the existing `plate` from session for the body (matches existing pattern) but consider scrubbing to `"your guest's car"` if security review flags.

## What's New copy (final, with A-1 honesty fix)

> **Simpler parking, smarter notifications**
>
> - **One-tap Park.** No more picking durations. Tap Park On to start, Park Off to stop.
> - **Daily mode (default).** Parking runs for 24 hours, then asks if you want to continue. Tap the notification to extend in one tap.
> - **Extended Stay mode.** Hosting a guest for a week or more? Switch to Extended Stay and parkDaddy auto-renews until you turn it off. We'll check in weekly so you don't forget.
> - **Reliable notifications.** Push notifications now work — make sure they're enabled in your phone's settings.

## Store listing follow-up

`docs/docs/store-listing.md` needs:
- Drop the explicit "2h, 4h, 8h, 12h, 24h, or overnight" line.
- Add a one-line mode mention in the "How it works" section.
- Optional: tweak the headline subtitle from "Auto-renew guest parking" to something like "One-tap guest parking that doesn't quit on you" (defer — separate PR).

## Test plan (manual; per the spec we're not adding test infra in this batch)

1. **Daily Park On → renewal → expiry warning → Extend via notification → another 24h cycle.** Verify push fires 15 min before `desiredEndTime`, Extend action opens app to extend flow, extend triggers immediate renewal tick, new `desiredEndTime` is 24h further out.
2. **Daily Park On → wait 24h without extend → session marks `completed`.** Verify no further parkeaz calls in logs.
3. **Extended Stay Park On → renewal runs past 24h → no expiry warning fires.** Verify weekly check-in is scheduled.
4. **Extended Stay weekly check-in fires → next check-in scheduled.** Verify the chain continues without user interaction.
5. **Mode toggle while session active.** Verify toggle is hidden on home; in-app behavior cannot change mode.
6. **Old-app session in-flight during update.** Verify it continues with original `desiredEndTime` and marks `completed` correctly.
7. **WhatsNewSheet on first launch of v3.1.** Verify shown once, dismissed permanently.
8. **Park Off cancels weekly check-in.** Verify `weeklyCheckInId` scheduled function is cancelled.

## Implementation order (suggested)

1. **Schema additions** (`users.mode`, `sessions.mode`, `sessions.weeklyCheckInId`) — safe additive change, deploy first.
2. **`users.updateMode` mutation** — also safe additive.
3. **`renewal.*` and `notifications.*` updates** with `session.mode ?? "daily"` default reads — preserves old-session behavior.
4. **`sessions.create` / `sessions.extend` mutation signature changes** — must coincide with client updates.
5. **Client: `<ParkToggle>`, `<ModeToggle>`, `<WhatsNewSheet>` components.**
6. **Client: home screen + start-parking + extend-duration screens** wired to new components.
7. **Notification category registration** in `app/_layout.tsx` + action handler routing.
8. **Drop `<DurationPresetGrid>`** once all callers are removed.
9. **buildNumber bump to 17 + new EAS build + TestFlight submission.**

## Out of scope (explicit no's for this PR)

- Test infrastructure (per session decision).
- Notification background-execution beyond opensAppToForeground (per A-1 fallback).
- "Coverage active until HH:MM" residual indicator.
- History tab status rework.
- Hard caps on Extended Stay session length.
- Apple Watch / widgets.
- Schema migration to drop old sessions' missing fields (handled by read-site defaults).

## Handoff to `/sc:implement` (or `/sc:workflow` first if you want a task breakdown)

Spec locked, design locked, feasibility resolved with explicit fallback. Implementation is mechanical from here. The biggest risk surface is the notification action routing in `app/_layout.tsx` — worth manual testing on a real device before merging.
