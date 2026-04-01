# Implementation Plan: ParkAssist Auto-Renewal (v2 — Convex Backend)

## Overview

Mobile app that automates guest parking renewal at Ponce Springs Lofts via the ParkEaz API. Users set a desired parking duration; the system auto-renews every 2 hours until time expires, with push notifications for expiry and failures.

## Task Type
- [x] Frontend (React Native — Gemini authority)
- [x] Backend (Convex — Codex authority)
- [x] Fullstack (Parallel)

---

## Technical Solution

**Architecture:** React Native (Expo) mobile app + Convex serverless backend.

**Why Convex?**
- `ctx.scheduler.runAfter()` / `runAt()` — native delayed job scheduling, no Redis/BullMQ needed
- Real-time subscriptions built in — mobile dashboard gets live countdown/status updates automatically
- Node.js runtime via `"use node"` — full cookie jar support (tough-cookie) for ParkEaz API calls
- Document database — no SQL migrations, schema defined in TypeScript
- Free tier covers this workload easily (~12 renewal cycles/day, 1-5 users)

**Why not the alternatives?**
- Supabase: pg_cron does fixed schedules, not dynamic "wake me in 110 minutes." Edge Functions (Deno) have no cookie jar.
- Cloudflare DO: Strongest scheduler (alarm auto-retry), but more custom plumbing for mobile layer. Runner-up.
- Self-hosted: Overkill for 1-5 users.

**Convex caveat:** Scheduled actions are at-most-once (not retried). Solution: schedule a **mutation** that checks state and invokes the **action**, with self-rescheduling retry on failure.

**Why a backend at all?** iOS cannot guarantee periodic background execution when the app is closed. A missed renewal = $250+ boot. The scheduler must live off-device.

**Mandatory config for all guests:** Zone 622 + Guest Code MTDJR7. These are required fields, not optional.

**ParkEaz API Flow (3 steps, all to paid.parkeaz.com):**
1. `POST /checkout` — register parking with user info, plate, guest code, zone=622, propertyid=202, parkstart
2. `POST /charge` — submit charge with parkstart/parkend, producttime=120, totalcharge=$0.00 (free via guest code)
3. `GET /successful_transaction?parkid=X&zone=622&remember=0` — confirmation, returns parkid

**Key insight:** Overnight handling (9 PM → 9 AM = 12 hours) derived from server-confirmed `parkend`, not hardcoded.

---

## Implementation Steps

### Phase 1: Convex Backend

**Step 1: Convex project setup**
- `npx convex init` in project root
- Configure schema, functions directory
- Set up environment variables for ParkEaz constants

**Step 2: Schema** (`convex/schema.ts`)
```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sessions: defineTable({
    plate: v.string(),
    guestCode: v.string(),        // MTDJR7
    zone: v.string(),             // 622 (mandatory)
    zoneId: v.string(),           // 247
    propertyId: v.string(),       // 202
    propertyName: v.string(),     // Ponce Springs Lofts
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    mobile: v.string(),
    desiredEndTime: v.number(),   // unix timestamp ms
    currentParkId: v.optional(v.string()),
    status: v.string(),           // scheduled | renewing | confirmed | failed | cancelled | completed
    nextRenewalAt: v.optional(v.number()),
    scheduledFunctionId: v.optional(v.id("_scheduled_functions")),
    parkeazCookie: v.optional(v.string()),  // serialized PHPSESSID
    lastParkStart: v.optional(v.number()),
    lastParkEnd: v.optional(v.number()),
    retryCount: v.number(),
    lastError: v.optional(v.string()),
  }).index("by_status", ["status"]),

  renewalLogs: defineTable({
    sessionId: v.id("sessions"),
    timestamp: v.number(),
    action: v.string(),           // checkout | charge | confirm | retry | failure | completed
    parkId: v.optional(v.string()),
    parkStart: v.optional(v.number()),
    parkEnd: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index("by_session", ["sessionId"]),

  pushTokens: defineTable({
    deviceToken: v.string(),
    platform: v.string(),         // ios | android
  }),
});
```

**Step 3: ParkEaz client** (`convex/parkeaz.ts` — Node action with `"use node"`)
- Uses `node-fetch` + `tough-cookie` for PHPSESSID management
- `checkout()`, `charge()`, `confirm()` functions
- Serializes cookie jar to string for DB storage
- Parses HTML responses to extract parkid, parkstart, parkend

**Step 4: Session mutations** (`convex/sessions.ts`)
- `createSession` — validate inputs, run initial booking action, schedule next renewal
- `getSession` — return current state (real-time via Convex subscription)
- `extendSession` — update desiredEndTime, reschedule if needed
- `cancelSession` — mark cancelled, cancel scheduled function

**Step 5: Renewal scheduler** (`convex/renewal.ts`)

The retry-safe pattern for Convex:
```
// Mutation: renewalTick (scheduled by ctx.scheduler)
//   1. Read session state
//   2. If cancelled/completed → no-op
//   3. Mark status = "renewing"
//   4. Call renewalAction (Node action that hits ParkEaz)
//   5. On success → update state, schedule next tick
//   6. On failure → increment retryCount, schedule retry or mark failed

// Action: renewalAction (Node runtime, "use node")
//   1. Deserialize cookie jar from session
//   2. POST /checkout
//   3. POST /charge
//   4. GET /successful_transaction
//   5. Return { parkId, parkStart, parkEnd, serializedCookies }
```

Key scheduling logic:
```typescript
// After successful renewal:
const confirmedParkEnd = result.parkEnd;
const bufferMs = 10 * 60 * 1000; // 10 min safety buffer
const nextRenewalDelay = confirmedParkEnd - Date.now() - bufferMs;

if (confirmedParkEnd >= session.desiredEndTime) {
  // Session complete — parking covers desired end time
  await ctx.db.patch(sessionId, { status: "completed" });
} else {
  // Schedule next renewal
  const scheduledId = await ctx.scheduler.runAfter(
    nextRenewalDelay,
    internal.renewal.renewalTick,
    { sessionId }
  );
  await ctx.db.patch(sessionId, {
    status: "confirmed",
    nextRenewalAt: Date.now() + nextRenewalDelay,
    scheduledFunctionId: scheduledId,
  });
}
```

**Step 6: Retry & escalation** (inside `renewalTick` mutation)
1. Retry with same cookie (up to 3 attempts, exponential backoff via `scheduler.runAfter`)
2. Fresh ParkEaz session retry (clear cookie, 1 attempt)
3. Push notification: "Renewal failed — open app to fix"
4. Urgent push if <15 min to expiry

**Step 7: Push notifications** (`convex/notifications.ts`)
- Expo Push Notifications (works with Expo's push service, no FCM setup needed)
- Expiry warning, failure alert, urgent alert
- Store device push tokens in `pushTokens` table

**Step 8: Convex cron for health check** (`convex/crons.ts`)
- Optional: every 30 min, scan for sessions in "confirmed" status with `nextRenewalAt` in the past (safety net for missed scheduled functions)

### Phase 2: Mobile App (React Native / Expo)

**Step 9: Expo project setup**
- `npx create-expo-app ParkAssistMobile`
- Install: `convex`, `expo-notifications`, `expo-secure-store`, `zustand`
- Configure Convex client with deployment URL

**Step 10: Navigation structure**
```
RootNavigator (Stack)
  ├── OnboardingScreen (shown once, profile setup)
  └── MainApp (Bottom Tabs)
       ├── DashboardScreen (dual-state: new session / active session)
       ├── HistoryScreen
       └── SettingsScreen
```

**Step 11: Convex real-time integration**
- `useQuery(api.sessions.getActive)` — live session status, countdown auto-updates
- No polling needed — Convex subscriptions push changes instantly
- Dashboard timer reads `lastParkEnd` and `nextRenewalAt` from live query

**Step 12: Onboarding screen** (`mobile/src/screens/OnboardingScreen.tsx`)
- Single form: plate number (large, auto-capitalize), name, phone, email
- Save profile to Expo SecureStore + Convex
- Zone 622 and guest code MTDJR7 are pre-filled (mandatory, not editable)

**Step 13: Dashboard screen** (`mobile/src/screens/DashboardScreen.tsx`)
- **No active session:** Preset grid (2hr, 4hr, 8hr, Overnight, Custom)
  - One-tap → calls Convex `createSession` mutation
  - Shows estimated renewal count
- **Active session:**
  - Large monospaced countdown timer (tabular-nums)
  - Color-coded status badge (green=confirmed, yellow=renewing, red=failed)
  - "Extend" and "Stop" buttons
  - Renewal log (from `renewalLogs` table, real-time)

**Step 14: History screen** (`mobile/src/screens/HistoryScreen.tsx`)
- SectionList grouped by month
- Shows date, duration, final status

**Step 15: Settings screen** (`mobile/src/screens/SettingsScreen.tsx`)
- Edit vehicle info, notification preferences
- Zone/guest code shown as read-only info

**Step 16: Push notification handling**
- Register Expo push token on app launch, store in Convex `pushTokens` table
- Handle notification tap → navigate to Dashboard

### Phase 3: Integration & Testing

**Step 17: End-to-end integration**
- Mobile ↔ Convex real-time flow
- Background renewal verification (phone off, app closed)
- Overnight scenario testing

**Step 18: Test coverage**
- **Unit:** ParkEaz client (payload serialization, HTML parsing), time/overnight logic
- **Integration:** Convex functions (session lifecycle, renewal scheduling, retry escalation)
- **Fixture-based:** Saved ParkEaz HTML responses for parser tests

---

## Key Files

| File | Operation | Description |
|------|-----------|-------------|
| `convex/schema.ts` | Create | Convex schema (sessions, renewalLogs, pushTokens) |
| `convex/parkeaz.ts` | Create | ParkEaz API client (Node action, cookie jar) |
| `convex/sessions.ts` | Create | Session CRUD mutations + queries |
| `convex/renewal.ts` | Create | Renewal tick mutation + action, retry logic |
| `convex/notifications.ts` | Create | Expo push notification sending |
| `convex/crons.ts` | Create | Health check cron (safety net) |
| `convex/time.ts` | Create | Renewal timing helpers |
| `mobile/src/screens/OnboardingScreen.tsx` | Create | Profile setup form |
| `mobile/src/screens/DashboardScreen.tsx` | Create | Dual-state: new session / active timer |
| `mobile/src/screens/HistoryScreen.tsx` | Create | Past sessions list |
| `mobile/src/screens/SettingsScreen.tsx` | Create | Vehicle info + preferences |
| `mobile/src/components/CountdownTimer.tsx` | Create | Large monospaced countdown |
| `mobile/src/components/StatusBadge.tsx` | Create | Color-coded status indicator |
| `mobile/src/components/PresetGrid.tsx` | Create | Duration preset buttons |
| `mobile/src/navigation/RootNavigator.tsx` | Create | Stack + Tab navigation |
| `mobile/src/hooks/useActiveSession.ts` | Create | Convex useQuery wrapper |
| `mobile/src/services/pushToken.ts` | Create | Expo push token registration |

---

## Risks and Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| iOS background execution unreliable | Critical | Convex server-side scheduler (entire reason for backend) |
| Convex scheduled actions are at-most-once | High | Mutation→action pattern with self-rescheduling retry loop |
| ParkEaz adds captcha/WAF/changes HTML | High | Isolated adapter, fixture-based parser tests |
| PHPSESSID expires mid-session | High | Fresh session retry path (clear cookie, re-bootstrap) |
| Ambiguous charge success (network timeout) | High | Confirmation step required, retry with idempotency check |
| Overnight rule varies by config/DST | Medium | Derive from server-confirmed parkend, never hardcode |
| Guest code or zone changes | Medium | Admin-configurable in Convex env vars |
| Missed scheduled function (edge case) | Low | Cron health check every 30 min as safety net |

---

## UI Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#000000` | True dark mode |
| Text Primary | `#FFFFFF` | High contrast |
| Accent Blue | `#0A84FF` | Preset buttons, actions |
| Status Green | `#30D158` | Active/confirmed parking |
| Status Yellow | `#FFD60A` | Renewing in progress |
| Status Red | `#FF453A` | Error/failure/stop |
| Timer Font | SF Pro Rounded, tabular-nums | Countdown stability |

---

## ParkEaz API Constants (from captured network calls)

| Parameter | Value | Notes |
|-----------|-------|-------|
| Base URL | `https://paid.parkeaz.com` | |
| Guest Code | `MTDJR7` | **Mandatory** — makes parking free ($0.00) |
| Zone | `622` | **Mandatory** for all guests |
| Zone ID | `247` | |
| Property ID | `202` | |
| Property Name | `Ponce Springs Lofts` | |
| Product | `3615` | |
| Product Time | `120` (minutes) | 2-hour window |
| Date Format | `YYYY-MM-DD+HH:MM:SS` | URL-encoded space as `+` |

---

## Architecture Decision Record

### Backend: Convex (chosen) vs alternatives

| Factor | Convex | Supabase | Cloudflare DO | Self-hosted |
|--------|--------|----------|---------------|-------------|
| Delayed scheduling | `runAfter()` native | pg_cron (fixed only) | DO alarms (strongest) | BullMQ (strongest) |
| Real-time to mobile | Built-in subscriptions | Realtime (good) | Custom WebSocket | Custom SSE/WS |
| Cookie jar support | Node actions (full) | Deno (no jar) | Manual | Full |
| DX / time to ship | Fastest | Medium | More custom | Slowest |
| Retry semantics | At-most-once (needs wrapper) | On you | Auto-retry on throw | BullMQ handles it |
| Ops burden | Zero (serverless) | Low | Low | High |
| Cost (this scale) | Free tier | Free tier | Free tier | ~$10-20/mo |

**Decision:** Convex gives the best balance of scheduling primitives, real-time mobile support, and zero ops for a personal tool. The at-most-once caveat is mitigated by the mutation→action retry pattern + cron health check safety net.

---

## SESSION_ID (for /ccg:execute use)
- CODEX_SESSION: 019d32d4-8023-79c0-9758-4206488cc0bd
- GEMINI_SESSION: 497885f5-777f-4a8c-8d64-ac5966f02b5a (from v1)
