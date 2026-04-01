# parkDaddy — Product Requirements Document (v4)

## Source of Truth

This document supersedes all prior PRDs (`parkassist-auto-renewal.md`, `parkassist-auto-renewal-v2.md`, `parkassist-prd.md`, `parkdaddy-v3.md`). It synthesizes decisions from v1-v3 and incorporates the latest requirements clarifications.

---

## 1. What Is parkDaddy?

parkDaddy is a mobile app that automates guest parking renewal at Ponce Springs Lofts (Atlanta). Guests download the app, register once, choose how long they want to park (up to 24 hours), and the app automatically re-registers their parking every 2 hours on a server — even if the phone is off, the app is closed, or there's no network. When the chosen time expires, the app asks if they want to continue.

### The Problem

Ponce Springs Lofts has no dedicated guest parking. Guest parking is shared with paid/valet parking for a nearby nightclub. Guests receive a code granting free 2-hour parking, but must manually re-register on a website every 2 hours or face an immediate boot ($250+ removal fee).

The current manual process:
1. Guest parks in the garage
2. Guest scans a QR code on a sign which opens the ParkEaz website
3. Guest enters: zone number, guest code, license plate, name, phone, email
4. Guest receives 2 hours of free parking
5. Near expiry, guest gets a text with a link to the website
6. To renew, guest must open the link and repeat the entire registration process
7. If the guest is asleep, away from their phone, has no network, or simply forgets — they are immediately booted

**Overnight behavior:** After 9 PM, the system grants parking until 8 AM (effectively up to ~11 hours). At 8 AM, the 2-hour cycle resumes. If the guest oversleeps past their registration window, they're booted.

### The Solution

parkDaddy replaces this manual cycle. A guest registers once in the app, picks a duration, and the server handles everything. The app is an "automated concierge" — it makes the 3 ParkEaz API calls on the guest's behalf every 2 hours, silently and reliably.

---

## 2. Users

### Primary User: Guest

- Visiting a resident at Ponce Springs Lofts
- Physically parks in the garage
- Downloads parkDaddy, creates an account with their own info (email, phone, license plate)
- Selects parking duration and the app handles the rest
- Does NOT need to know the guest code, zone, or any ParkEaz-specific details

### Secondary User: Resident

- Lives at Ponce Springs Lofts
- Tells their guest to download parkDaddy instead of using the manual ParkEaz website
- Has no in-app role — the resident is the word-of-mouth distribution channel
- Does NOT need an account in the app

### Key Constraints

- One active parking session per guest account at a time
- The app is only useful for Ponce Springs Lofts guests — no broader market
- No invite system, no resident approval step — the app's utility is self-limiting to people who actually need to park there

---

## 3. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Mobile Framework | Expo (latest SDK) + Expo Router | File-based routing, latest Expo recommendation |
| Backend | Convex | Native `scheduler.runAfter()` for renewals, real-time subscriptions, zero ops |
| Auth | Clerk | Email + password, integrates with Convex via JWT |
| Language | TypeScript | End-to-end type safety |
| Push Notifications | Expo Push Notifications | Works with Expo's push service, no FCM setup needed |

### Existing Infrastructure

| Resource | Value |
|----------|-------|
| Convex Deployment | `tidy-seal-196` (team: fontez, project: backend) |
| Convex URL | `https://tidy-seal-196.convex.cloud` |
| Clerk Publishable Key | `pk_test_ZnVubnktc3VuYmVhbS05NC5jbGVyay5hY2NvdW50cy5kZXYk` |
| Clerk JWT Issuer | `https://funny-sunbeam-94.clerk.accounts.dev` |
| Expo env prefix | `EXPO_PUBLIC_` |
| Guest Code | Convex env var (currently `MTDJR7`, updated ~annually) |

---

## 4. ParkEaz API Integration

### Network Flow (3 sequential calls, all required)

Derived from captured Chrome DevTools network calls (`docs/Ponce Park Assist.md`).

**Step 0: Obtain PHPSESSID**
- `GET https://paid.parkeaz.com` (or any page) returns `Set-Cookie: PHPSESSID=xxx`
- This is a standard PHP session cookie. Any fresh one works — the captured value is not special.
- The cookie jar is managed server-side (Convex Node action with `tough-cookie`).

**Step 1: `POST /checkout`**
- Submits all registration data: plate, name, phone, email, guest code, zone, parkstart
- Content-Type: `application/x-www-form-urlencoded`
- Key fields: `product=3615`, `guestcode=MTDJR7`, `zone=622`, `zoneid=247`, `propertyid=202`, `plate=<PLATE>`, `parkstart=<YYYY-MM-DD+HH:MM:SS>`, `extension=0`
- Vehicle make/model/color are optional (ParkEaz accepts blank)

**Step 2: `POST /charge`**
- Confirms the transaction with parkstart/parkend, pricing ($0.00 via guest code)
- Key fields: `producttime=120`, `totalcharge=0`, `stripeprice=0`, `guestcode=MTDJR7`
- `parkend` is calculated as parkstart + 2 hours (or overnight window)
- Returns/sets `parkid` for confirmation step

**Step 3: `GET /successful_transaction?parkid=<ID>&zone=622&remember=0`**
- Confirmation page. The `parkid` comes from Step 2.
- Response includes additional cookies (plate, firstname, lastname, etc.) — useful for cookie jar persistence

### API Constants

| Parameter | Value | Source |
|-----------|-------|--------|
| Base URL | `https://paid.parkeaz.com` | Static |
| Guest Code | `MTDJR7` | Convex env var `PARKEAZ_GUEST_CODE` |
| Zone | `622` | Static |
| Zone ID | `247` | Static |
| Property ID | `202` | Static |
| Property Name | `Ponce Springs Lofts` | Static |
| Product | `3615` | Static |
| Product Time | `120` (minutes) | Static |
| Date Format | `YYYY-MM-DD+HH:MM:SS` | URL-encoded space as `+` |

### Overnight Logic

- After 9 PM: ParkEaz grants parking until 8 AM (not a fixed 12 hours — it always ends at 8 AM)
- The app derives timing from server-confirmed `parkend`, never hardcodes the 9 PM/8 AM rule
- At 8 AM, 2-hour renewal cycles resume automatically

---

## 5. Functional Requirements

### FR-1: Guest Account Creation

- Guest creates account via Clerk (email + password)
- After sign-up, guest completes a profile: first name, last name, phone number, email (pre-filled from Clerk)
- Profile data is stored in Convex and used for ParkEaz API calls
- No resident account, no invite code, no approval flow

### FR-2: Start a Parking Session

- Guest enters license plate (required), vehicle make/model/color (optional)
- Guest selects parking duration from presets: 2h, 4h, 8h, 12h, 24h, Overnight
- "Overnight" calculates hours until 8 AM next day
- Custom duration: minimum 2 hours, maximum 24 hours, 1-hour increments
- App shows confirmation summary: plate, duration, estimated end time, renewal count
- On confirm: server makes the 3 ParkEaz API calls immediately, schedules next renewal
- One active session per guest at a time

### FR-3: Automatic Renewal Engine

- Server renews parking every ~2 hours by re-executing the 3 ParkEaz API calls
- Renewal fires 10 minutes before the confirmed `parkend` (safety buffer)
- If ParkEaz returns a long overnight window, the server skips renewals until that window nears expiry
- Renewals continue until the guest's chosen duration expires
- All renewals happen server-side (Convex scheduled functions) — works with app closed/phone off

### FR-4: Active Session Dashboard

- Displays: status (active/renewing/error), time remaining (large countdown), plate, zone
- Renewal log: timestamps of each successful renewal
- Actions: Extend Time, Stop Parking

### FR-5: Extend Duration

- From active session, guest can add more time (same preset options as FR-2)
- Extension adds to the current remaining time
- Server adjusts renewal schedule accordingly

### FR-6: Session Expiry and Re-up

- 15 minutes before chosen duration expires: push notification "Parking expires in 15 min. Extend?"
- If guest extends: new duration begins, renewals continue
- If guest does nothing: session ends when duration expires, server stops renewing
- Final notification: "Guest parking has ended for [PLATE]."
- The app does NOT auto-extend without guest consent

### FR-7: Stop Parking Early

- Guest taps "Stop Parking" -> confirmation dialog
- On confirm: server cancels future renewals
- Current 2-hour ParkEaz registration remains valid until natural expiry
- Session moves to history

### FR-8: Renewal Failure Handling

- On failure: server retries up to 3 times with same cookie (exponential backoff)
- If all retries fail: try once with a fresh PHPSESSID
- If still failing: push notification "Parking renewal failed for [PLATE]! Open app."
- App shows error state: what went wrong, time remaining on current registration, "Retry Now" button, manual fallback link to ParkEaz website
- Urgent push if <15 min to current registration expiry

### FR-9: Session History

- List of past sessions, newest first, grouped by time period
- Each entry: date, plate, total duration, how it ended (completed/stopped early/failed)
- Tappable for detail view with full renewal log

### FR-10: Saved Vehicles

- App remembers plates from past sessions
- On new session, guest can select from saved vehicles (pre-fills plate)
- Manage saved vehicles from Settings

### FR-11: Push Notifications

| Trigger | Urgency | Message |
|---------|---------|---------|
| 15 min before chosen duration ends | High | "Parking expires in 15 min. Extend?" |
| Chosen duration expired | Medium | "Guest parking has ended for [PLATE]." |
| Renewal failed after retries | Critical | "Parking renewal failed for [PLATE]! Open app." |
| Renewal failed, <15 min to expiry | Critical | "URGENT: Parking for [PLATE] expires in [X] min and renewal failed!" |
| Successful renewal (optional, off by default) | Low | "Parking renewed for [PLATE]. Next renewal at [TIME]." |

### FR-12: Settings

- Edit profile (name, phone, email)
- Manage saved vehicles
- Notification preferences (expiry warnings on/off, renewal success alerts on/off)
- App version, support contact
- Sign out
- No zone or guest code editing — these are server-managed

---

## 6. Non-Functional Requirements

### NFR-1: Reliability

- Renewal engine must be resilient to: app closure, phone power-off, network loss, Convex cold starts
- Convex cron safety net: every 30 min, scan for sessions with `nextRenewalAt` in the past
- Mutation-then-action pattern to handle Convex's at-most-once scheduled action semantics

### NFR-2: Latency

- ParkEaz API calls must complete well within the 2-hour window
- Renewal fires 10 min before expiry to allow for retries

### NFR-3: Security

- PHPSESSID cookies stored encrypted in Convex (not exposed to client)
- Guest code stored as Convex env var, never exposed to client
- All ParkEaz API calls happen server-side only
- Clerk handles auth — no custom password storage

### NFR-4: Glanceability

- Active session screen readable in <1 second
- Status + countdown must be the dominant visual elements
- Error states must be impossible to miss ($250 consequences)

### NFR-5: Minimum Taps

- Returning user with saved vehicle: 3 taps to start parking (Start -> plate pre-filled -> duration -> confirm)
- Extend from notification: 2 taps (notification -> preset)

---

## 7. Screen Inventory

All screens derived from Stitch designs in `stitch_parkdaddy/`. Branding: "parkDaddy" throughout (not "ParkAssist").

| Screen | Stitch Reference | States | Priority |
|--------|-----------------|--------|----------|
| Welcome | `welcome_screen/` | Single | Medium |
| Profile Setup | `profile_setup/` | Empty form, validation errors | Medium |
| Home (No Active Session) | `home_inactive/` | Empty state, with saved vehicles | High |
| Home (Active Session) | `active_session/` | Active, Renewing, Error | High (most important) |
| Start Parking | `start_parking/` | Form + duration grid | High |
| Review Session | `review_session/` | Confirmation summary | Medium |
| Extend Duration | `extend_duration/` | Duration grid + impact summary | High |
| Renewal Failure | `renewal_failure_state/` | Error + retry + manual fallback | High |
| Stop Parking | `stop_parking_confirmation/` | Modal overlay | Low |
| History | `history/` | Grouped list | Low |
| Settings | `settings/` | Profile, vehicles, notifications | Low |

### Design Corrections (Stitch -> Implementation)

| Issue in Stitch | Fix |
|-----------------|-----|
| All screens say "ParkAssist" | Rename to "parkDaddy" |
| Zone shows "P-8042" on active/error screens | Use zone `622` consistently |
| Bottom nav inconsistent across screens | Standardize to Home / History / Settings (3 tabs) |
| Review screen shows "Edit" on resident code | Remove — code is server-managed, not user-visible |
| Stop confirmation shows "$4.50/hour" and "Current Cost: $9.00" | Remove — parking is free via guest code |
| Active session shows "Downtown District" map label | Remove or replace with "Ponce Springs Lofts" |
| Welcome says "Resident Access" in status pill | Change to "Guest Parking" — guests are the primary users |
| Settings shows "Jane Resident" persona | Profile reflects the guest's info |
| Review/failure screens show 4-tab bottom nav (Parking/Activity/Vehicles/Account or Support) | Standardize to 3-tab: Home/History/Settings |

### Navigation Structure (Expo Router — file-based)

```
app/
  _layout.tsx              # Root layout: ClerkProvider + ConvexProvider
  (auth)/
    _layout.tsx            # Auth flow stack
    welcome.tsx            # Welcome screen
    sign-in.tsx            # Clerk sign-in
    sign-up.tsx            # Clerk sign-up
    profile-setup.tsx      # Post-signup profile completion
  (tabs)/
    _layout.tsx            # Bottom tab layout (Home, History, Settings)
    index.tsx              # Home (dual-state: inactive/active/error)
    history.tsx            # Session history
    settings.tsx           # Profile, vehicles, notifications
  start-parking.tsx        # Stack push from Home
  review-session.tsx       # Stack push from Start Parking
  extend-duration.tsx      # Stack push from Active Session
```

---

## 8. Design System

Sourced from `stitch_parkdaddy/guardian_flow/DESIGN.md`. Creative North Star: **"The Architectural Concierge"** — luxury hotel lobby feel, calm authority, too professional to fail.

### Color Tokens

| Token | Hex | Usage |
|-------|-----|-------|
| Primary (Trust) | `#000666` | Deep indigo — CTAs, branding, foundation |
| Primary Container | `#1a237e` | Gradient end, hero cards |
| Secondary (Urgency) | `#b6171e` | Error states, "Boot Risk" warnings |
| Tertiary (Success) | `#8df5e4` | Active registration confirmation |
| Surface | `#f9f9fb` | App background |
| On-Surface | `#1a1c1d` | Primary text (never pure black) |

### Typography

- Font: **Inter** (all weights)
- Display scale: countdown timer, license plate confirmation only
- Headline scale: alarm-style headers (expiry, errors)
- Title/Body: card headers, instructions
- Label: all caps, 0.05em tracking for "instrument cluster" aesthetic

### Key Design Rules

- **No-Line Rule**: no 1px borders for sectioning. Use background color shifts.
- **Glass & Gradient**: CTAs use gradient `primary -> primary_container` (150deg). Floating elements use glassmorphism (`rgba(255,255,255,0.8)` + `backdrop-blur(20px)`).
- **Tonal Layering**: elevation via stacked containers, not drop shadows.
- **Ghost Borders**: if accessibility requires a stroke, use `outline_variant` at 15% opacity.
- **No pure black** (#000000): use `on_surface` (#1a1c1d) for text.
- **CTA shadows**: `rgba(0,6,102,0.15)` for subtle depth on gradient buttons.

---

## 9. User Stories & Acceptance Criteria

### US-1: Guest Sign-Up
**As a** guest visiting Ponce Springs Lofts,
**I want to** create an account with my email and password,
**So that** I can start using automated parking.

**Acceptance Criteria:**
- [ ] Guest can sign up with email + password via Clerk
- [ ] After sign-up, guest is prompted to complete profile (first name, last name, phone)
- [ ] Email is pre-filled from Clerk session
- [ ] Profile is saved to Convex
- [ ] Guest is navigated to Home screen after profile completion
- [ ] Subsequent launches skip onboarding if profile exists

### US-2: Start Parking
**As a** guest with a completed profile,
**I want to** enter my plate and choose a duration,
**So that** my parking is automatically renewed without manual intervention.

**Acceptance Criteria:**
- [ ] License plate input is prominent, auto-capitalized
- [ ] Duration presets: 2h, 4h, 8h, 12h, 24h, Overnight
- [ ] "Overnight" calculates hours until 8 AM
- [ ] Confirmation screen shows: plate, duration, end time, renewal count
- [ ] On confirm, server executes ParkEaz checkout -> charge -> confirm
- [ ] Session appears on Home with active status and countdown
- [ ] Cannot start a second session while one is active

### US-3: Automatic Renewal
**As a** guest with an active session,
**I want** the server to re-register my parking every 2 hours,
**So that** I don't get booted while I'm visiting.

**Acceptance Criteria:**
- [ ] Server fires renewal 10 min before confirmed parkend
- [ ] Renewal executes the full 3-step ParkEaz flow
- [ ] Each renewal is logged (timestamp, parkid, parkstart, parkend)
- [ ] Renewal log visible on active session screen
- [ ] Overnight windows respected (no unnecessary renewals)
- [ ] Renewals continue with app closed / phone off

### US-4: Session Expiry Notification
**As a** guest whose chosen duration is about to end,
**I want to** receive a notification 15 minutes before expiry,
**So that** I can extend if I need more time.

**Acceptance Criteria:**
- [ ] Push notification fires 15 min before chosen duration ends
- [ ] Notification has actionable "Extend" button
- [ ] Tapping notification opens app to extend flow
- [ ] If no action: session ends at chosen time, final notification sent
- [ ] App does NOT auto-extend

### US-5: Extend Duration
**As a** guest with an active session,
**I want to** add more time,
**So that** my parking continues beyond my original choice.

**Acceptance Criteria:**
- [ ] Same duration presets as start flow
- [ ] Shows impact: new end time, additional renewal count
- [ ] Server adjusts scheduled renewals
- [ ] Countdown updates in real-time

### US-6: Stop Parking
**As a** guest who is leaving early,
**I want to** stop my session,
**So that** the server stops renewing (current 2-hour window finishes naturally).

**Acceptance Criteria:**
- [ ] Confirmation dialog before stopping
- [ ] Clear messaging: current registration valid until natural expiry
- [ ] Future renewals cancelled
- [ ] Session moves to history

### US-7: Renewal Failure Recovery
**As a** guest whose renewal failed,
**I want to** be alerted immediately and have options to fix it,
**So that** I don't get booted.

**Acceptance Criteria:**
- [ ] Server retries 3x with same cookie, then 1x with fresh PHPSESSID
- [ ] Push notification on failure
- [ ] Urgent push if <15 min to current registration expiry
- [ ] App shows: error description, time remaining, "Retry Now" button
- [ ] Manual fallback: link to ParkEaz website
- [ ] Successful retry clears error state

### US-8: Saved Vehicles
**As a** returning guest,
**I want to** quickly select my previously used plate,
**So that** I can start parking in fewer taps.

**Acceptance Criteria:**
- [ ] Plates saved automatically after first use
- [ ] Home screen shows saved vehicles when no active session
- [ ] Tapping a saved vehicle pre-fills the plate on Start Parking
- [ ] Can manage (delete) vehicles from Settings

### US-9: Session History
**As a** guest,
**I want to** see my past parking sessions,
**So that** I can review when and how long I parked.

**Acceptance Criteria:**
- [ ] History grouped by time period (last 30 days, older)
- [ ] Each entry: date, plate, duration, outcome (completed/stopped/failed)
- [ ] Tap for detail: full renewal log with timestamps

---

## 10. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| iOS background execution unreliable | Critical | Convex server-side scheduler (entire reason for backend) |
| Convex scheduled actions are at-most-once | High | Mutation->action pattern + cron safety net every 30 min |
| ParkEaz adds captcha/WAF/changes HTML | High | Isolated adapter, fixture-based parser tests, manual fallback link |
| PHPSESSID expires mid-session | High | Fresh session retry path (clear cookie, re-bootstrap) |
| Ambiguous charge success (network timeout) | High | Confirmation step required, retry with idempotency check |
| Overnight rule varies by config/DST | Medium | Derive from server-confirmed parkend, never hardcode |
| Guest code changes | Low | Convex env var update, no app release needed |

---

## 11. Out of Scope (v1)

- Multiple simultaneous guest vehicles per account
- Resident accounts or resident-specific features
- Payment integration (parking is free via guest code)
- Map / garage availability / space counting
- Guest-to-resident communication
- Admin panel for property management
- Changing guest code or zone from within the app
- Custom duration picker (presets only for v1)

---

## 12. Open Questions

1. **Overnight cutoff verification**: Believed to be 8 AM. Confirm via server-returned `parkend` from the first overnight registration. System adapts automatically regardless.

2. **Rate limiting**: Does ParkEaz throttle requests? If a guest makes 12 renewals in 24 hours, will the system flag it? Unknown — monitor in production.

3. **Multiple properties**: Could expand to other ParkEaz-managed complexes. Architecture keeps property values configurable via env vars, but multi-property UX is out of scope for v1.

4. **App Store review**: An app automating third-party website interactions may face scrutiny. Consider TestFlight distribution for initial rollout vs public App Store listing.
