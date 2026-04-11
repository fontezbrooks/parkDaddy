# Project Index: parkDaddy

Generated: 2026-04-11

## Project Structure

```
parkDaddy/
├── app/                        # Expo Router screens (14 files)
│   ├── _layout.tsx             # Root layout — Clerk + Convex providers, notification handler
│   ├── (auth)/                 # Auth flow
│   │   ├── _layout.tsx         # Auth guard with profile redirect logic
│   │   ├── welcome.tsx         # Landing page with Get Started / Sign In
│   │   ├── sign-in.tsx         # Clerk sign-in
│   │   ├── sign-up.tsx         # Clerk sign-up
│   │   └── profile-setup.tsx   # First-time profile form (name, email, mobile)
│   ├── (tabs)/                 # Main tab navigator
│   │   ├── _layout.tsx         # Tab bar config, profile gate
│   │   ├── index.tsx           # Home — active session dashboard or empty state
│   │   ├── history.tsx         # Past sessions (SectionList by period)
│   │   └── settings.tsx        # Profile, vehicles, notification prefs, sign out
│   ├── start-parking.tsx       # Vehicle + duration selection
│   ├── review-session.tsx      # Confirm before starting
│   ├── extend-duration.tsx     # Add time to active session
│   └── confirm-stop.tsx        # Modal — cancel active session
├── convex/                     # Backend (Convex serverless, 13 files)
│   ├── schema.ts               # 5 tables: users, vehicles, sessions, renewalLogs, pushTokens
│   ├── sessions.ts             # Session CRUD: create, extend, cancel, retry, getActive, listHistory, getDetail
│   ├── renewal.ts              # State machine: tick → renewing → saveResult/handleFailure
│   ├── parkeaz.ts              # ParkEaz HTTP scraping (3-step: form → checkout → charge → success)
│   ├── notifications.ts        # Push dispatch: expiryWarning, sessionEnded, renewalFailure, urgentFailure
│   ├── notificationsHelpers.ts # Token queries + dead token pruning
│   ├── users.ts                # Profile CRUD: getProfile, upsertProfile, updateNotificationPrefs
│   ├── vehicles.ts             # Vehicle CRUD: list, add, remove
│   ├── pushTokens.ts           # Push token registration (keeps only latest per user)
│   ├── crons.ts                # 30-min safety net cron
│   ├── cronHandlers.ts         # Stuck session recovery (5-min threshold)
│   └── auth.config.ts          # Clerk JWT provider config
├── src/
│   ├── components/             # 7 shared UI components
│   │   ├── CountdownTimer.tsx  # Live countdown with animated digits
│   │   ├── DurationPresetGrid.tsx # Duration selection grid
│   │   ├── GoogleSignInButton.tsx # OAuth button
│   │   ├── GradientButton.tsx  # Primary CTA (gradient/outline/secondary variants)
│   │   ├── StatusPill.tsx      # Session status badge
│   │   ├── SurfaceCard.tsx     # Elevated card container
│   │   └── VehicleCard.tsx     # Vehicle display card
│   └── theme/                  # Design tokens
│       ├── colors.ts           # 18 tokens (primary #000666, secondary #b6171e, tertiary #8df5e4)
│       ├── typography.ts       # 14 type styles (Inter, display→label scale)
│       ├── spacing.ts          # 9 spacing (4-48px) + 5 radius values
│       └── index.ts            # Barrel export
├── docs/                       # App Store listing copy
├── stitch_parkdaddy/           # Design mockups (HTML + PNGs, 12 screens)
├── types/                      # fonts.d.ts declaration
└── assets/                     # App icons and splash screen
```

## Entry Points

- **App**: `app/_layout.tsx` — Root layout (ClerkProvider → ConvexProviderWithClerk → Stack)
- **Backend**: `convex/schema.ts` — Database schema (5 tables, 6 indexes)
- **Config**: `app.json` — Expo config (bundle ID: `com.parkdaddy.app`, EAS project)
- **Build**: `eas.json` — EAS Build profiles

## What This App Does

Automated guest parking renewal for **Ponce Springs Lofts** via **ParkEaz**. Users register their vehicle, select a parking duration (up to 24h), and the app automatically re-registers parking every 2 hours (ParkEaz's max window) via server-side HTTP form scraping with cookie management. Exponential backoff on failure (4 retries), safety-net cron for stuck sessions, and push notifications for expiry warnings and failures.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Expo SDK | 54 |
| Runtime | React Native (New Arch) | 0.81.5 |
| Navigation | Expo Router | 6 |
| Language | TypeScript (strict) | 5.9.2 |
| Backend | Convex (serverless) | 1.34.1 |
| Auth | Clerk (Expo) | 2.19.33 |
| Notifications | Expo Push API | 0.32.16 |
| Fonts | Inter (Google Fonts) | — |
| HTTP | node-fetch + tough-cookie | 2.7.0 / 6.0.1 |

## Database Schema (5 tables, 6 indexes)

| Table | Key Fields | Indexes |
|-------|------------|---------|
| users | clerkId, firstName, lastName, email, mobile, notifyOnExpiry/Success | by_clerk_id |
| vehicles | userId, plate, makeModel?, color?, lastUsedAt | by_user |
| sessions | userId, plate, desiredEndTime, status, currentParkId?, retryCount, scheduledFunctionId? | by_user_status, by_status, by_next_renewal |
| renewalLogs | sessionId, action, parkId?, parkStart/End?, error? | by_session |
| pushTokens | userId, token, platform | by_user |

## Core Backend Architecture

### Renewal State Machine (`renewal.ts`)
```
create → tick → renewing → [ParkEaz API] → saveResult → active (schedule next)
                                           → handleFailure → retry (≤4) or failed
```
- Buffer: 10 min before parkEnd triggers next renewal
- Backoff: 2^n × 5s (max 4 retries)
- Safety net: 30-min cron recovers stuck sessions (>5 min in renewing)

### ParkEaz Integration (`parkeaz.ts`)
- 3-step HTTP flow: GET /paid → POST /checkout → POST /charge → GET /successful_transaction
- Browser UA spoofing with full header set (Chrome 146 on macOS)
- Cookie jar per request (fresh session each renewal)
- Eastern timezone date formatting for ParkEaz server
- Zone 622, Property 202, Product 3615 (2-hour window)

### Notifications (`notifications.ts`)
- `sendExpiryWarning` — 15 min before desired end
- `sendSessionEnded` — Session completed notification
- `sendRenewalFailure` / `sendUrgentFailure` — Failure alerts with urgency tier
- `push` — Expo Push API with dead token pruning

## UI Screens (10 total)

| Screen | File | Purpose |
|--------|------|---------|
| Welcome | `(auth)/welcome.tsx` | Landing with branding |
| Sign In/Up | `(auth)/sign-in.tsx`, `sign-up.tsx` | Clerk auth |
| Profile Setup | `(auth)/profile-setup.tsx` | First-time user profile |
| Home | `(tabs)/index.tsx` | Active session dashboard or empty state |
| History | `(tabs)/history.tsx` | Past sessions grouped by 30-day period |
| Settings | `(tabs)/settings.tsx` | Profile, vehicles, notification prefs |
| Start Parking | `start-parking.tsx` | Vehicle + duration entry |
| Review Session | `review-session.tsx` | Confirm before starting |
| Extend Duration | `extend-duration.tsx` | Add time to active session |
| Confirm Stop | `confirm-stop.tsx` | Modal to cancel active session |

## Environment Variables

| Variable | Context | Purpose |
|----------|---------|---------|
| EXPO_PUBLIC_CONVEX_URL | Client | Convex deployment URL |
| EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY | Client | Clerk public key |
| CLERK_JWT_ISSUER_DOMAIN | Convex | Clerk JWT domain |
| PARKEAZ_GUEST_CODE | Convex | ParkEaz guest code (secret) |

## Codebase Stats

- **Total source lines**: ~5,194
- **Frontend files**: 25 (app/ + src/)
- **Backend files**: 13 (convex/)
- **Unit tests**: 0
- **Commits**: 9 (main branch)
- **App version**: 1.0.0 (submitted to App Store 2026-04-06)

## Quick Start

1. `npm install`
2. Set env vars in `.env.local` and Convex dashboard
3. `npx convex dev` (backend)
4. `npm start` (Expo dev server)
5. `npx expo run:ios` (native build)
