# Implementation Plan: ParkAssist Auto-Renewal

## Overview

Mobile app that automates guest parking renewal at Ponce Springs Lofts via the ParkEaz API. Users set a desired parking duration; the system auto-renews every 2 hours until time expires, with push notifications for expiry and failures.

## Task Type
- [x] Frontend (React Native — Gemini authority)
- [x] Backend (Node.js/Express/BullMQ — Codex authority)
- [x] Fullstack (Parallel)

---

## Technical Solution

**Architecture:** React Native mobile app + lightweight Node.js backend scheduler.

**Why a backend?** iOS cannot guarantee periodic background execution when the app is closed. A missed renewal means a $250+ boot. The scheduler must live off-device.

**ParkEaz API Flow (3 steps, all POST/GET to paid.parkeaz.com):**
1. `POST /checkout` — register parking with user info, plate, guest code, zone/property IDs, parkstart
2. `POST /charge` — submit charge with parkstart/parkend, producttime=120, totalcharge=$0.00 (free via guest code MTDJR7)
3. `GET /successful_transaction?parkid=X&zone=622&remember=0` — confirmation, returns parkid

**Key insight:** Overnight handling (9 PM → 9 AM = 12 hours) should be derived from the server-confirmed `parkend`, not hardcoded. When ParkEaz returns a `parkend` on the next day, the renewal scheduler naturally delays until then.

---

## Implementation Steps

### Phase 1: Backend Core (Codex authority)

**Step 1: Project scaffold**
- Express app with TypeScript
- PostgreSQL (sessions table), Redis (BullMQ job queue)
- Separate `api` and `worker` entrypoints

**Step 2: ParkEaz client module** (`backend/src/clients/parkeazClient.ts`)
- Cookie jar management (tough-cookie) for PHPSESSID persistence
- `checkout()`, `charge()`, `confirm()` methods
- HTML response parsing to extract `parkid`, `parkstart`, `parkend`
- Cookie serialization/deserialization for DB storage

**Step 3: Data model** (`backend/migrations/001_create_sessions.sql`)
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  plate TEXT NOT NULL,
  guest_code TEXT NOT NULL,
  zone TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  property_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  mobile TEXT NOT NULL,
  desired_end_time TIMESTAMPTZ NOT NULL,
  current_park_id TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  next_renewal_at TIMESTAMPTZ,
  parkeaz_cookie_ciphertext TEXT,
  last_park_start TIMESTAMPTZ,
  last_park_end TIMESTAMPTZ,
  retry_count INT NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
```

**Step 4: Session API routes** (`backend/src/routes/sessions.ts`)
- `POST /sessions` — create session, run initial booking immediately, schedule next renewal
- `GET /sessions/:id` — return current state + timing
- `POST /sessions/:id/extend` — update desiredEndTime, reschedule
- `DELETE /sessions/:id` — cancel, remove pending BullMQ jobs

**Step 5: Renewal worker** (`backend/src/jobs/renewalWorker.ts`)
- State machine: `scheduled → checkout_ok → charge_ok → confirmed → (scheduled | completed)`
- Safety buffer: renew 10 minutes before expiry
- Per-session DB row lock to prevent concurrent renewals
- Derive next renewal from server-confirmed `parkend`

**Step 6: Retry & escalation** (`backend/src/services/renewalService.ts`)
1. Retry same cookie jar (up to 3 attempts with exponential backoff)
2. Fresh ParkEaz session retry (1 attempt)
3. Push notification: "Renewal failed — manual action needed"
4. Urgent alert if <15 min to expiry

**Step 7: Notifications** (`backend/src/services/notificationService.ts`)
- Firebase Cloud Messaging integration
- Expiry warning (20 min before), failure alert, urgent alert
- Actionable notifications with "Extend" deep link

**Step 8: Startup recovery**
- On worker boot, query DB for active sessions with pending renewals
- Re-enqueue missing BullMQ delayed jobs

### Phase 2: Mobile App (Gemini authority)

**Step 9: React Native project setup**
- Expo or bare RN with TypeScript
- Zustand for state management (persisted via AsyncStorage)
- expo-notifications (or notifee) for push notifications
- expo-secure-store for sensitive data (auth token)

**Step 10: Navigation structure**
```
RootNavigator (Stack)
  ├── OnboardingScreen (shown once, profile setup)
  └── MainApp (Bottom Tabs)
       ├── DashboardScreen (dual-state: new session / active session)
       ├── HistoryScreen
       └── SettingsScreen
```

**Step 11: Onboarding screen** (`mobile/src/screens/OnboardingScreen.tsx`)
- Single form: plate number (large, auto-capitalize), name, phone, email
- Save profile to device + backend
- One-time setup, then skip on subsequent launches

**Step 12: Dashboard screen** (`mobile/src/screens/DashboardScreen.tsx`)
- **No active session:** Preset grid (2hr, 4hr, 8hr, Overnight, Custom)
  - One-tap "Start Parking" → calls backend `POST /sessions`
  - Shows estimated renewal count
- **Active session:**
  - Large monospaced countdown timer (tabular-nums)
  - Color-coded status badge (green=active, yellow=renewing, red=error)
  - "Extend" and "Stop" buttons
  - Renewal history log

**Step 13: History screen** (`mobile/src/screens/HistoryScreen.tsx`)
- SectionList grouped by month
- Shows date, duration, final status (success/error dot)

**Step 14: Settings screen** (`mobile/src/screens/SettingsScreen.tsx`)
- Edit vehicle info, notification preferences
- iOS-style grouped list

**Step 15: Push notification handling**
- Register FCM token with backend on app launch
- Handle notification categories: `PARKING_ALERT` with "Extend 2 Hours" action
- Deep link from notification → Dashboard with extend modal

### Phase 3: Integration & Testing

**Step 16: End-to-end integration**
- Mobile ↔ Backend API integration
- Background renewal verification
- Overnight scenario testing

**Step 17: Test coverage**
- **Unit:** ParkEaz client (payload serialization, HTML parsing), time/overnight logic, retry escalation
- **Integration:** API routes (CRUD), renewal worker (state transitions, scheduling)
- **Fixture-based:** Saved ParkEaz HTML responses for parser tests
- **Recovery:** Worker restart with pending sessions in DB

---

## Key Files

| File | Operation | Description |
|------|-----------|-------------|
| `backend/src/app.ts` | Create | Express app setup |
| `backend/src/server.ts` | Create | API entrypoint |
| `backend/src/config/env.ts` | Create | Environment config |
| `backend/src/config/crypto.ts` | Create | AES-256-GCM cookie encryption |
| `backend/src/clients/parkeazClient.ts` | Create | ParkEaz API client with cookie jar |
| `backend/src/routes/sessions.ts` | Create | Session CRUD routes |
| `backend/src/controllers/sessionsController.ts` | Create | Route handlers |
| `backend/src/services/sessionService.ts` | Create | Session lifecycle management |
| `backend/src/services/renewalService.ts` | Create | Renewal state machine + retry logic |
| `backend/src/services/notificationService.ts` | Create | FCM push notifications |
| `backend/src/jobs/renewalWorker.ts` | Create | BullMQ worker for renewals |
| `backend/src/jobs/renewalScheduler.ts` | Create | Job scheduling with delayed execution |
| `backend/src/repositories/sessionsRepo.ts` | Create | DB access layer with row locking |
| `backend/src/domain/time.ts` | Create | Renewal timing + overnight logic |
| `backend/migrations/001_create_sessions.sql` | Create | Sessions schema |
| `mobile/src/store/useParkStore.ts` | Create | Zustand store (profile, session, history) |
| `mobile/src/screens/OnboardingScreen.tsx` | Create | Profile setup form |
| `mobile/src/screens/DashboardScreen.tsx` | Create | Dual-state: new session / active timer |
| `mobile/src/screens/HistoryScreen.tsx` | Create | Past sessions list |
| `mobile/src/screens/SettingsScreen.tsx` | Create | Vehicle info + notification prefs |
| `mobile/src/services/api.ts` | Create | Backend API client |
| `mobile/src/services/notifications.ts` | Create | Push notification registration + handling |

---

## Risks and Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| iOS cannot guarantee background execution | Critical | Backend-owned scheduler (primary reason for backend) |
| ParkEaz adds captcha/WAF/changes HTML | High | Isolated adapter, fixture-based parser tests, manual WebView fallback |
| PHPSESSID expires mid-session | High | Fresh session retry path, cookie health checks |
| Ambiguous charge success (network timeout) | High | Idempotency guard, confirmation step, per-vehicle lock |
| Overnight rule varies by config/DST | Medium | Derive from server-confirmed parkend, never hardcode times |
| Rate limiting or guest code revocation | Medium | Conservative cadence, admin-configurable code/lot params |
| Double renewal execution | Medium | DB row lock + stable BullMQ jobId |

---

## UI Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#000000` | True dark mode |
| Text Primary | `#FFFFFF` | High contrast |
| Accent Blue | `#0A84FF` | Preset buttons, actions |
| Status Green | `#30D158` | Active parking |
| Status Yellow | `#FFD60A` | Renewing in progress |
| Status Red | `#FF453A` | Error/failure/stop |
| Timer Font | SF Pro Rounded, tabular-nums | Countdown stability |

---

## ParkEaz API Constants (from captured network calls)

| Parameter | Value | Notes |
|-----------|-------|-------|
| Base URL | `https://paid.parkeaz.com` | |
| Guest Code | `MTDJR7` | Makes parking free ($0.00) |
| Zone | `622` | |
| Zone ID | `247` | |
| Property ID | `202` | |
| Property Name | `Ponce Springs Lofts` | |
| Product | `3615` | |
| Product Time | `120` (minutes) | 2-hour window |
| Date Format | `YYYY-MM-DD+HH:MM:SS` | URL-encoded space as `+` |

---

## SESSION_ID (for /ccg:execute use)
- CODEX_SESSION: 019d32c1-c8d5-7111-9796-9d2833c0ea40
- GEMINI_SESSION: 497885f5-777f-4a8c-8d64-ac5966f02b5a
