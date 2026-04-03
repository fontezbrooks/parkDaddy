# Project Index: parkDaddy

Generated: 2026-04-02

## Project Structure

```
parkDaddy/
├── app/                    # Expo Router screens
│   ├── (auth)/             # Auth flow (welcome, sign-in/up, profile-setup)
│   ├── (tabs)/             # Main tabs (home, history, settings)
│   ├── _layout.tsx         # Root layout — Clerk + Convex providers
│   ├── start-parking.tsx   # Start new parking session
│   ├── review-session.tsx  # Review before confirming
│   ├── extend-duration.tsx # Extend active session
│   └── confirm-stop.tsx    # Stop parking modal
├── convex/                 # Backend (Convex serverless)
│   ├── schema.ts           # Database schema (5 tables)
│   ├── sessions.ts         # Session CRUD + lifecycle
│   ├── renewal.ts          # Renewal state machine (tick/save/fail)
│   ├── parkeaz.ts          # ParkEaz API integration (HTTP scraping)
│   ├── notifications.ts    # Push notification dispatch
│   ├── notificationsHelpers.ts # Token queries + pruning
│   ├── users.ts            # User profile management
│   ├── vehicles.ts         # Vehicle CRUD
│   ├── pushTokens.ts       # Push token registration
│   ├── crons.ts            # Safety-net cron (30-min scan)
│   ├── cronHandlers.ts     # Cron logic (stuck session recovery)
│   └── auth.config.ts      # Clerk JWT config for Convex
├── src/
│   ├── components/         # 7 shared UI components
│   └── theme/              # Design tokens (colors, typography, spacing)
├── stitch_parkdaddy/       # Design mockups (HTML + PNGs, 12 screens)
├── docs/                   # PRD and design documents
├── types/                  # TypeScript declarations (fonts.d.ts)
└── assets/                 # App icons and splash screen
```

## Entry Points

- **App**: `app/_layout.tsx` — Root layout with Clerk auth + Convex providers
- **Backend**: `convex/schema.ts` — Database schema (source of truth for data model)
- **Config**: `app.json` — Expo config (bundle ID: `com.parkdaddy.app`)

## What This App Does

Automated guest parking renewal for **Ponce Springs Lofts** via **ParkEaz**. Users register their vehicle, set a desired parking duration, and the app automatically re-registers parking every 2 hours (ParkEaz max) until the desired end time — using server-side HTTP form scraping with cookie management.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Expo SDK | 54 |
| Runtime | React Native | 0.81.5 |
| Navigation | Expo Router | 6 |
| Language | TypeScript | 5.9.2 |
| Backend | Convex | 1.34.1 |
| Auth | Clerk | 2.19.33 |
| Notifications | Expo Push API | 0.32.16 |
| Fonts | Inter (Google Fonts) | — |

## Database Schema (5 tables)

- **users** — Clerk-linked profiles (name, email, mobile, notification prefs)
- **vehicles** — License plates per user (plate, makeModel, color)
- **sessions** — Parking sessions (status machine: active → renewing → active/failed/completed)
- **renewalLogs** — Audit trail per session (initial, renewal, failure, completed, cancelled)
- **pushTokens** — Expo push tokens per user

## Core Backend Modules

### `convex/parkeaz.ts` (ParkEaz API)
- `renewalAction` — Internal action: 3-step HTTP flow (form page → /checkout → /charge → /successful_transaction)
- Uses cookie jar (tough-cookie) + browser UA spoofing
- Zone 622, Property 202 (Ponce Springs Lofts), 2-hour product

### `convex/renewal.ts` (State Machine)
- `tick` — Checks session state, triggers ParkEaz renewal
- `saveResult` — Saves successful renewal, schedules next tick 10 min before parkEnd
- `handleFailure` — Exponential backoff (4 retries), then marks failed + sends notification

### `convex/sessions.ts` (Session Lifecycle)
- `create` — Validates, upserts vehicle, creates session, triggers first tick
- `extend` — Adds time to desiredEndTime, reschedules expiry warning
- `cancel` — Cancels scheduled functions, marks cancelled
- `retry` — Resets failed session to active, triggers tick
- `getActive` / `listHistory` / `getDetail` — Queries

### `convex/notifications.ts` (Push Notifications)
- `sendExpiryWarning` — 15 min before desired end
- `sendSessionEnded` — Session completed
- `sendRenewalFailure` / `sendUrgentFailure` — Failure notifications
- `push` — Sends via Expo Push API, prunes dead tokens

## UI Components (src/components/)

| Component | Purpose |
|-----------|---------|
| CountdownTimer | Live countdown display for active sessions |
| DurationPresetGrid | Duration selection grid (preset buttons) |
| GoogleSignInButton | OAuth sign-in button |
| GradientButton | Primary action button with gradient |
| StatusPill | Session status badge (active/failed/etc) |
| SurfaceCard | Card container with elevation |
| VehicleCard | Vehicle display with plate number |

## Screens (10 total)

**Auth (4)**: welcome → sign-in / sign-up → profile-setup
**Tabs (3)**: Home (active session / start) | History | Settings
**Flows (3)**: start-parking → review-session | extend-duration | confirm-stop (modal)

## Configuration

- `app.json` — Expo app config (iOS + Android, portrait only)
- `tsconfig.json` — Strict mode, `@/*` path alias
- `eslint.config.mjs` — Expo flat ESLint config
- `convex/auth.config.ts` — Clerk JWT provider for Convex

## Environment Variables Required

- `EXPO_PUBLIC_CONVEX_URL` — Convex deployment URL
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk public key
- `CLERK_JWT_ISSUER_DOMAIN` — Clerk JWT domain (Convex-side)
- `PARKEAZ_GUEST_CODE` — ParkEaz guest code (Convex-side secret)

## Test Coverage

- Unit tests: 0 files
- Integration tests: 0 files
- E2E tests: 0 files

## Codebase Stats

- **Total TS/TSX lines**: ~4,300
- **Commits**: 4
- **Branch**: `maintaince/fix-npm-package-conflicts`

## Quick Start

1. `npm install`
2. Set env vars in `.env.local` and Convex dashboard
3. `npx convex dev` (backend)
4. `npm start` (Expo dev server)
