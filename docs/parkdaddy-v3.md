# Implementation Plan: parkDaddy v3 (Stitch Designs + Convex + Clerk Auth)

## Overview

**parkDaddy** is a mobile app for Ponce Springs Lofts residents that automates guest parking renewal via the ParkEaz API. This plan translates the Google Stitch UI designs into React Native (Expo) screens, backed by Convex serverless functions and Clerk authentication.

## Task Type
- [x] Frontend (React Native / Expo — translate Stitch HTML → RN components)
- [x] Backend (Convex — scheduler, ParkEaz client, real-time subscriptions)
- [x] Auth (Clerk — email + password, already configured)

---

## Existing Setup

| Resource | Value |
|----------|-------|
| Convex Deployment | `tidy-seal-196` (team: fontez, project: backend) |
| Convex URL | `https://tidy-seal-196.convex.cloud` |
| Clerk Publishable Key | `pk_test_ZnVubnktc3VuYmVhbS05NC5jbGVyay5hY2NvdW50cy5kZXYk` |
| Clerk JWT Issuer | `https://funny-sunbeam-94.clerk.accounts.dev` |
| Expo env prefix | `EXPO_PUBLIC_` |

---

## Design System (from `guardian_flow/DESIGN.md`)

**Creative North Star:** "The Architectural Concierge" — luxury hotel lobby feel, calm authority, too professional to fail.

| Token | Value | Usage |
|-------|-------|-------|
| Primary (Trust) | `#000666` | Deep indigo — foundation, CTAs, branding |
| Primary Container | `#1a237e` | Gradient end, hero cards |
| Secondary (Urgency) | `#b6171e` | Error states, "Boot Risk" warnings |
| Tertiary (Success) | `#8df5e4` | Active registration confirmation |
| Surface | `#f9f9fb` | App background |
| On-Surface | `#1a1c1d` | Primary text (never pure black) |
| Font | Inter (all weights) | Display, headline, body, label scales |
| Icons | Material Symbols Outlined | Standard icon set |
| Elevation | Tonal layering (no drop shadows) | Surface → Container Low → Container Lowest |
| Borders | "No-Line" rule — use background shifts | Ghost borders at 15% opacity for accessibility |
| CTAs | Gradient `primary → primary-container` (150°) | Subtle shadow `rgba(0,6,102,0.15)` |
| Glass | `rgba(255,255,255,0.8)` + `backdrop-blur(20px)` | Floating elements, countdown pills |

---

## Screen Inventory (Stitch → React Native Mapping)

### Standardized Bottom Navigation
The Stitch designs have inconsistent nav tabs. Standardize to:

| Tab | Icon | Label |
|-----|------|-------|
| Home | `home_app_logo` | Home |
| History | `history` | History |
| Settings | `settings` | Settings |

### Screen-by-Screen Translation

#### 1. Welcome Screen (`welcome_screen/`)
**Stitch:** Full-screen hero with security imagery, "Welcome to ParkAssist" heading, "Get Started" + "Sign In" buttons, "System Online" glass pill at bottom.

**React Native translation:**
- `WelcomeScreen.tsx` — Stack navigator initial route (unauthenticated)
- Hero image → `Image` component with overlay gradient
- "Get Started" → navigates to Clerk sign-up flow
- "Sign In" → navigates to Clerk sign-in flow
- "System Online" pill → animated status indicator
- **Rename:** "Welcome to parkDaddy" + all branding references

#### 2. Profile Setup (`profile_setup/`)
**Stitch:** First name, last name, phone, email form. "ParkAssist" branding with parking icon.

**React Native translation:**
- `ProfileSetupScreen.tsx` — shown after first Clerk sign-up (onboarding gate)
- Form fields: first name, last name, phone, email (pre-fill email from Clerk)
- "Get Started" button → saves profile to Convex `users` table
- **Rename:** all "ParkAssist" → "parkDaddy"

#### 3. Home — No Active Session (`home_inactive/`)
**Stitch:** "No active session" empty state, "START NEW PARKING SESSION" large CTA, saved vehicles cards (ABC-1234, GA-992-XYZ), "Precision Enforcement Protection" feature hint.

**React Native translation:**
- `HomeScreen.tsx` — dual-state component (inactive/active)
- Empty state with car icon + messaging
- Full-width gradient CTA → navigates to Start Parking
- Saved vehicles → `FlatList` of `VehicleCard` components, tappable to quick-start
- Feature hint card → informational `View`
- Top bar: hamburger menu + "parkDaddy" + profile avatar
- Bottom tab nav: Home (active), History, Settings

#### 4. Start Parking (`start_parking/`)
**Stitch:** License plate hero input (large, uppercase), make/model + color optional fields, duration preset grid (2h/4h/8h/12h/24h/Overnight), estimated end time summary, "Confirm & Start" fixed bottom CTA.

**React Native translation:**
- `StartParkingScreen.tsx` — stack push from Home
- `LicensePlateInput` component — large `TextInput`, `autoCapitalize="characters"`
- Optional fields grid: make/model, color
- `DurationPresetGrid` component — 3-column grid of `Pressable` buttons
  - Selected state: primary background + ring + shadow
  - "Overnight" preset: special styling with bedtime icon
- `SessionSummary` component — estimated end time + renewal count
- Fixed bottom bar with "Confirm & Start" gradient button
- **Pre-fill** plate from saved vehicles if user tapped one from Home

#### 5. Review Session (`review_session/`)
**Stitch:** Confirmation card with plate, duration, end time. Bento grid: Zone 622 + Renewals count. Resident code MTDJR7 (with Edit). Trust note about auto-renewal. "Confirm & Start Session" + "Change Duration" buttons. Bottom nav: Parking/Activity/Vehicles/Account.

**React Native translation:**
- `ReviewSessionScreen.tsx` — stack push from Start Parking
- Hero card: plate, duration, end time, "Validating" glass pill
- Info grid: zone card (622), renewals count card
- Resident code row: MTDJR7 displayed (read-only, no Edit — code is app-managed)
- Trust note: info card about auto-renewal + 15-min notification
- "Confirm & Start Session" → calls Convex `createSession` mutation
- "Change Duration" → pops back to Start Parking
- **Fix:** Bottom nav standardized to Home/History/Settings (not Parking/Activity/Vehicles/Account)

#### 6. Active Session (`active_session/`)
**Stitch:** "ACTIVE (REGISTERED)" teal status pill. Hero card: deep indigo background with large countdown timer (07:42:15), glass pill showing session end time, vehicle + zone info grid. Renewal log: last renewed + next scheduled. "Extend Time" gradient CTA + "Stop Parking" outline button. Map preview.

**React Native translation:**
- `HomeScreen.tsx` — active state (same component, conditional render)
- `StatusPill` component — teal background, animated pulse
- `SessionHeroCard` component — primary gradient background
  - `CountdownTimer` — large tabular-nums text, updates every second via `useEffect`
  - Glass pill with end time
  - Vehicle + Zone info grid (zone = 622, **not** P-8042)
- `RenewalLog` component — last renewed + next scheduled cards
- "Extend Time" → navigates to Extend Duration screen
- "Stop Parking" → shows Stop Parking modal
- Map preview → optional, can use `react-native-maps` or static image
- **Real-time:** `useQuery(api.sessions.getActive)` drives all data

#### 7. Extend Duration (`extend_duration/`)
**Stitch:** Vehicle summary with plate + "Active" badge + current end time. Duration preset grid (2x3: 2h/4h/8h/12h/24h/Custom). Impact summary: new end time (large) + "Tomorrow" badge + renewal count info. "Confirm Extension" fixed bottom CTA.

**React Native translation:**
- `ExtendDurationScreen.tsx` — stack push from Active Session
- Vehicle summary card with current session info
- `DurationPresetGrid` (shared component with Start Parking)
- Impact summary card: new end time calculation, additional renewal count
- "Confirm Extension" → calls Convex `extendSession` mutation
- Pops back to Home (active state) on success

#### 8. Renewal Failure (`renewal_failure_state/`)
**Stitch:** Red "RENEWAL FAILED" alarm header (full-width secondary background). Countdown to expiry in glass card over red gradient. Connection error details (icon + message). Plate + zone info. "Retry Now" red gradient button. Manual fallback link to ParkEaz website. Bottom nav: Parking/Vehicles/History/Support.

**React Native translation:**
- `HomeScreen.tsx` — error state variant (conditional render when `status === 'failed'`)
- `AlarmHeader` component — full-width secondary background, pushes content down
- `ExpiryCountdown` — countdown in glass card over error gradient
- Error details card: icon + plain-language message
- "Retry Now" → calls Convex `retryRenewal` mutation
- "Register Manually at ParkEaz" → `Linking.openURL()` to ParkEaz website
- **Fix:** Bottom nav standardized, zone = 622

#### 9. Stop Parking Confirmation (`stop_parking_confirmation/`)
**Stitch:** Modal overlay with backdrop blur over active session. Red accent stripe at top. Warning icon + "Stop Parking?" heading. Explanation text (current registration remains valid until natural expiry). "Stop Parking" primary button + "Cancel" text button.

**React Native translation:**
- `StopParkingModal` component — React Native `Modal` with blur overlay
- Warning icon + confirmation text
- "Stop Parking" → calls Convex `cancelSession` mutation
- "Cancel" → dismisses modal

#### 10. History (`history/`)
**Stitch:** Grouped by time period (Last 30 Days, Older). Session cards: status icon (check/info/warning) + date + plate + duration + status badge (Completed/Stopped Early/Failed). Chevron for detail. Older section has reduced opacity.

**React Native translation:**
- `HistoryScreen.tsx` — bottom tab screen
- `SectionList` grouped by time period
- `SessionHistoryCard` component — status icon, date, plate, duration, badge
- Tap → detail view (future: renewal log for that session)
- Data: `useQuery(api.sessions.listHistory)`

#### 11. Settings (`settings/`)
**Stitch:** Profile section (avatar with initials, name, member since, email, phone). Saved vehicles list (with Add New). Notification toggles (Expiry Warnings, Renewal Success Alerts). App info (version). Contact Support. Sign Out.

**React Native translation:**
- `SettingsScreen.tsx` — bottom tab screen
- Profile card: Clerk user data (name, email, phone)
- Saved vehicles: `FlatList` from Convex `vehicles` table + "Add New"
- Notification toggles: `Switch` components, stored in Convex user preferences
- "Sign Out" → `clerk.signOut()`
- App version from `expo-constants`

---

## Implementation Steps

### Phase 0: Project Scaffolding

**Step 1: Initialize Expo project**
```bash
npx create-expo-app parkDaddy --template expo-template-blank-typescript
cd parkDaddy
```

**Step 2: Install dependencies**
```bash
# Convex
npx convex dev --once  # initialize convex/ directory
npm install convex

# Clerk
npm install @clerk/clerk-expo

# Navigation
npm install @react-navigation/native @react-navigation/bottom-tabs @react-navigation/stack
npm install react-native-screens react-native-safe-area-context

# UI
npm install expo-font expo-constants expo-notifications expo-secure-store expo-linking
npm install react-native-reanimated  # for animations
```

**Step 3: Configure Convex + Clerk integration**
- Set up Clerk JWT template in Convex dashboard
- Configure `ConvexProviderWithClerk` in `App.tsx`

### Phase 1: Convex Backend

**Step 4: Auth configuration** (`convex/auth.config.ts`)
- Configure Clerk as auth provider using JWT issuer domain
- Set up `ctx.auth.getUserIdentity()` for all authenticated functions

**Step 5: Schema** (`convex/schema.ts`)
```typescript
// Tables: users, vehicles, sessions, renewalLogs, pushTokens
// users: clerkId, firstName, lastName, email, mobile, notifyOnExpiry, notifyOnSuccess
// vehicles: userId, plate, makeModel, color, label, lastUsedAt
// sessions: userId, vehicleId, plate, guestCode, zone, zoneId, propertyId, propertyName,
//           firstName, lastName, email, mobile, desiredEndTime, currentParkId, status,
//           nextRenewalAt, scheduledFunctionId, parkeazCookie, lastParkStart, lastParkEnd,
//           retryCount, lastError
// renewalLogs: sessionId, timestamp, action, parkId, parkStart, parkEnd, error
// pushTokens: userId, deviceToken, platform
```

**Step 6: User functions** (`convex/users.ts`)
- `getOrCreateUser` — called after Clerk sign-in, upserts user profile
- `updateProfile` — update name, phone, email
- `getProfile` — return current user data

**Step 7: Vehicle functions** (`convex/vehicles.ts`)
- `addVehicle` — save plate + optional make/model/color
- `listVehicles` — return user's saved vehicles
- `deleteVehicle` — remove a saved vehicle
- `touchVehicle` — update `lastUsedAt` on session start

**Step 8: ParkEaz client** (`convex/parkeaz.ts` — `"use node"` action)
- Cookie jar via `tough-cookie` + `node-fetch`
- `checkout()`, `charge()`, `confirm()` — replicate the 3 API calls
- Parse HTML responses to extract `parkid`, `parkstart`, `parkend`
- Serialize/deserialize cookie jar for DB storage

**Step 9: Session functions** (`convex/sessions.ts`)
- `createSession` — validate, save vehicle, run initial booking, schedule renewal
- `getActiveSession` — real-time query for current user's active session
- `extendSession` — update `desiredEndTime`, reschedule
- `cancelSession` — mark cancelled, remove scheduled function
- `retryRenewal` — manually trigger a retry from error state
- `listHistory` — past sessions for current user

**Step 10: Renewal engine** (`convex/renewal.ts`)
- `renewalTick` (internal mutation) — state machine: check status → invoke action → update → reschedule
- `renewalAction` (internal action, `"use node"`) — execute ParkEaz API calls
- Retry logic: 3 attempts same cookie → 1 fresh session → push notification → urgent alert
- Safety buffer: renew 10 min before confirmed parkend
- Overnight: derive from server-confirmed parkend (no hardcoded 9 PM rule)

**Step 11: Notifications** (`convex/notifications.ts`)
- Expo Push Notifications via `expo-server-sdk`
- `sendExpiryWarning` — 15 min before chosen duration ends
- `sendRenewalFailure` — after retries exhausted
- `sendUrgentAlert` — <15 min to current registration expiry + failed state
- `sendRenewalSuccess` — optional, based on user preference

**Step 12: Cron safety net** (`convex/crons.ts`)
- Every 30 min: scan for sessions in active status with `nextRenewalAt` in the past
- Re-schedule any missed renewals

### Phase 2: React Native Frontend

**Step 13: App shell** (`App.tsx`)
- `ClerkProvider` → `ConvexProviderWithClerk` → Navigation
- Auth gate: unauthenticated → Welcome/SignIn, authenticated → check profile → Home

**Step 14: Design system** (`src/theme/`)
- `colors.ts` — all color tokens from DESIGN.md
- `typography.ts` — Inter font scales (display, headline, title, body, label)
- `spacing.ts` — spacing constants (4px base unit)
- Shared components: `GlassPanel`, `GradientButton`, `StatusPill`, `SurfaceCard`

**Step 15: Navigation** (`src/navigation/`)
- `RootNavigator` — Stack: Welcome | SignIn | SignUp | ProfileSetup | MainTabs
- `MainTabNavigator` — Bottom tabs: Home, History, Settings
- `HomeStack` — Stack within Home tab: HomeScreen | StartParking | ReviewSession | ExtendDuration

**Step 16: Welcome screen** (`src/screens/WelcomeScreen.tsx`)
- Translate `welcome_screen/code.html` → React Native
- Hero image, "Welcome to parkDaddy" heading, subtitle
- "Get Started" → `clerk.openSignUp()`
- "Sign In" → `clerk.openSignIn()`
- "System Online" animated glass pill

**Step 17: Profile setup** (`src/screens/ProfileSetupScreen.tsx`)
- Translate `profile_setup/code.html` → React Native
- Pre-fill email from Clerk session
- "Get Started" → calls Convex `updateProfile` + navigates to Home

**Step 18: Home screen** (`src/screens/HomeScreen.tsx`)
- Dual-state: renders inactive OR active OR error based on `useQuery(api.sessions.getActiveSession)`
- **Inactive:** empty state + "START NEW PARKING SESSION" CTA + saved vehicles
- **Active:** status pill + hero card with countdown + renewal log + extend/stop buttons
- **Error:** alarm header + expiry countdown + retry/manual fallback

**Step 19: Start Parking** (`src/screens/StartParkingScreen.tsx`)
- Translate `start_parking/code.html` → React Native
- License plate hero input + optional fields
- Duration preset grid (shared `DurationPresetGrid` component)
- Session summary with estimated end time + renewal count

**Step 20: Review Session** (`src/screens/ReviewSessionScreen.tsx`)
- Translate `review_session/code.html` → React Native
- Confirmation card + zone/renewals bento grid + resident code + trust note
- "Confirm & Start Session" → Convex `createSession`

**Step 21: Extend Duration** (`src/screens/ExtendDurationScreen.tsx`)
- Translate `extend_duration/code.html` → React Native
- Current session summary + duration grid + impact summary
- "Confirm Extension" → Convex `extendSession`

**Step 22: History screen** (`src/screens/HistoryScreen.tsx`)
- Translate `history/code.html` → React Native
- SectionList with session history cards

**Step 23: Settings screen** (`src/screens/SettingsScreen.tsx`)
- Translate `settings/code.html` → React Native
- Profile, vehicles, notification toggles, sign out

**Step 24: Stop Parking modal** (`src/components/StopParkingModal.tsx`)
- Translate `stop_parking_confirmation/code.html` → React Native Modal

**Step 25: Push notification setup**
- Register Expo push token on app launch
- Store in Convex `pushTokens` table
- Handle notification tap → navigate to Home

### Phase 3: Integration & Testing

**Step 26: End-to-end flow testing**
- Sign up → profile setup → start parking → active session → extend → stop
- Renewal failure → retry → manual fallback
- Background renewal verification (phone off/app closed)
- Overnight scenario

**Step 27: Test coverage**
- **Unit:** ParkEaz client (payload serialization, HTML parsing), time logic, renewal state machine
- **Integration:** Convex functions (session lifecycle, scheduling, auth guards)
- **Fixture-based:** Saved ParkEaz HTML responses

---

## Key Files

| File | Description |
|------|-------------|
| **Convex Backend** | |
| `convex/schema.ts` | Schema: users, vehicles, sessions, renewalLogs, pushTokens |
| `convex/auth.config.ts` | Clerk JWT auth configuration |
| `convex/users.ts` | User profile CRUD |
| `convex/vehicles.ts` | Saved vehicles CRUD |
| `convex/sessions.ts` | Session lifecycle (create, extend, cancel, query) |
| `convex/renewal.ts` | Renewal engine (tick mutation + ParkEaz action) |
| `convex/parkeaz.ts` | ParkEaz API client (Node action) |
| `convex/notifications.ts` | Expo push notification sending |
| `convex/crons.ts` | Safety net cron for missed renewals |
| **React Native Frontend** | |
| `App.tsx` | Clerk + Convex providers, auth gate |
| `src/theme/colors.ts` | Design system color tokens |
| `src/theme/typography.ts` | Inter font scales |
| `src/navigation/RootNavigator.tsx` | Auth flow + main tabs |
| `src/navigation/MainTabNavigator.tsx` | Home, History, Settings tabs |
| `src/screens/WelcomeScreen.tsx` | Landing page with sign up/in |
| `src/screens/ProfileSetupScreen.tsx` | Onboarding profile form |
| `src/screens/HomeScreen.tsx` | Dual-state: inactive / active / error |
| `src/screens/StartParkingScreen.tsx` | Vehicle info + duration selection |
| `src/screens/ReviewSessionScreen.tsx` | Pre-start confirmation |
| `src/screens/ExtendDurationScreen.tsx` | Extend active session |
| `src/screens/HistoryScreen.tsx` | Past sessions list |
| `src/screens/SettingsScreen.tsx` | Profile, vehicles, prefs |
| `src/components/CountdownTimer.tsx` | Large tabular-nums countdown |
| `src/components/StatusPill.tsx` | Active/renewing/error indicator |
| `src/components/DurationPresetGrid.tsx` | Shared duration selection grid |
| `src/components/SessionHeroCard.tsx` | Primary gradient card with timer |
| `src/components/GlassPanel.tsx` | Glassmorphism container |
| `src/components/GradientButton.tsx` | Primary CTA with gradient |
| `src/components/StopParkingModal.tsx` | Confirmation modal |
| `src/components/VehicleCard.tsx` | Saved vehicle display |
| `src/components/RenewalLog.tsx` | Last/next renewal info |
| `src/components/AlarmHeader.tsx` | Full-width error banner |

---

## Design Corrections (Stitch → Implementation)

| Issue in Stitch | Fix |
|-----------------|-----|
| All screens say "ParkAssist" | Rename to "parkDaddy" |
| Zone shows "P-8042" on active/error screens | Use zone `622` consistently |
| Bottom nav inconsistent (4 different layouts) | Standardize to Home / History / Settings |
| Review screen shows "Edit" on resident code | Remove — code is app-managed, not user-editable |
| Stop confirmation shows "$4.50/hour" and "Current Cost: $9.00" | Remove — parking is free via guest code |
| Active session shows "Downtown District" map label | Remove or replace with "Ponce Springs Lofts" |

---

## Risks and Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| iOS background execution unreliable | Critical | Convex server-side scheduler |
| Convex scheduled actions at-most-once | High | Mutation→action pattern + cron safety net |
| ParkEaz captcha/WAF/HTML changes | High | Isolated adapter, fixture tests, manual fallback |
| PHPSESSID expiry | High | Fresh session retry path |
| Clerk token expiry during long sessions | Medium | Convex validates JWT on each call, Clerk auto-refreshes |
| Stitch HTML ≠ React Native 1:1 | Medium | Use as visual reference, rebuild with RN primitives |

---

## ParkEaz API Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| Base URL | `https://paid.parkeaz.com` | |
| Guest Code | `MTDJR7` | **Mandatory**, semi-permanent, app-managed |
| Zone | `622` | **Mandatory** for all guests |
| Zone ID | `247` | |
| Property ID | `202` | |
| Property Name | `Ponce Springs Lofts` | |
| Product | `3615` | |
| Product Time | `120` (minutes) | 2-hour window |
| Date Format | `YYYY-MM-DD+HH:MM:SS` | URL-encoded space as `+` |

---

## SESSION_ID (for /ccg:execute use)
- CODEX_SESSION: 019d32d4-8023-79c0-9758-4206488cc0bd
- GEMINI_SESSION: 497885f5-777f-4a8c-8d64-ac5966f02b5a
