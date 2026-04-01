# ParkAssist — Product Requirements Document

## For: Designer Handoff (UX Workflows Only — No Visual Design Specifications)

---

## 1. What Is ParkAssist?

ParkAssist is a mobile app for residents of Ponce Springs Lofts (Atlanta) that automates guest parking renewal in the building's shared parking garage.

### The Problem

The apartment complex has no dedicated guest parking. Guest parking is shared with paid/valet parking. Guests receive a code that grants them free 2-hour parking. After 2 hours, they must manually re-register on a website or their vehicle is immediately booted ($250+ removal fee).

The current process:
1. Guest parks in the garage
2. Guest scans a QR code on a sign → opens the ParkEaz website
3. Guest enters: zone number, guest code, license plate, name, phone, email
4. Guest receives 2 hours of free parking
5. Near expiry, guest gets a text with a link to the website
6. To renew, guest must open the link and repeat the entire registration process
7. If the guest is asleep, away from their phone, has no network, or simply forgets — they get booted immediately

After 9 PM, the system grants 12 hours instead of 2. But the 2-hour cycle resumes the next morning, and if the guest oversleeps, they're booted.

### The Solution

ParkAssist lets a resident (or their guest) register once, choose how long they want to park (up to 24 hours), and the app automatically re-registers every 2 hours on a server — even if the phone is off, the app is closed, or there's no network. When the chosen time expires, the app asks if they want to continue.

---

## 2. Users

### Primary User: Resident
- Lives at Ponce Springs Lofts
- Has guests who need parking
- May register parking on behalf of their guest, or may hand off to the guest to do it
- Wants peace of mind — no more waking up every 2 hours

### Secondary User: Guest
- Visiting a resident
- Physically parks in the garage
- May use the app themselves if they download it, or the resident handles it for them

### Key constraint
- One active guest parking session per resident at a time

---

## 3. User Experience Workflows

### 3.1 First Launch / Onboarding

**Goal:** Get the resident set up as fast as possible so they can start parking.

**Flow:**
1. App opens → Welcome screen explaining what ParkAssist does in 1-2 sentences
2. Resident creates a profile:
   - Name (first, last)
   - Phone number
   - Email
3. Resident is taken to the home screen (no active session state)

**Notes for designer:**
- Profile is about the resident, not the guest. When registering a guest's car, the resident enters the guest's vehicle info separately.
- Zone (622) and guest code (MTDJR7) are pre-configured in the app — the resident never needs to enter these.
- Onboarding should be completable in under 60 seconds.

---

### 3.2 Start a Parking Session

**Goal:** Resident (or guest) starts automated parking with one decision: "how long?"

**Precondition:** No active parking session exists.

**Flow:**
1. Home screen shows "No active parking" state with a clear call-to-action to start
2. User taps "Start Parking"
3. User enters guest vehicle info:
   - License plate number (required)
   - Vehicle make, model, color (optional — ParkEaz accepts blank)
4. User selects parking duration:
   - Quick presets: 2 hours, 4 hours, 8 hours, 12 hours, 24 hours
   - "Overnight" preset (contextual — calculates hours until 9 AM next day)
   - Custom duration picker (minimum 2 hours, maximum 24 hours, 1-hour increments)
5. App shows a confirmation summary:
   - Plate number
   - Duration selected
   - Estimated number of auto-renewals (e.g., "8 hours = 4 renewals")
   - Estimated end time (e.g., "Parking until 11:00 PM")
6. User confirms → parking begins immediately
7. App transitions to the Active Session screen

**Notes for designer:**
- The license plate input should be prominent — it's the most important field and most error-prone
- Duration presets should be fast to tap — this is the primary interaction
- The "Overnight" preset should be smart: if it's 10 PM, it calculates "~11 hours until 9 AM"
- After the first session, the app should remember the last-used plate number and offer it as a default for next time

---

### 3.3 Active Parking Session

**Goal:** User can glance at their phone and instantly know the parking status.

**Precondition:** An active parking session exists.

**Flow:**
1. Home screen shows the active session dashboard:
   - Current parking status (active, renewing, error)
   - Time remaining until the chosen duration expires (large, prominent countdown)
   - The license plate being covered
   - A log of renewal events (e.g., "Renewed at 2:15 PM", "Renewed at 4:15 PM")
2. Two actions available:
   - **Extend** — add more time (goes to duration selection, same as step 4 in 3.2)
   - **Stop Parking** — end the session early

**What happens behind the scenes (invisible to user):**
- Server automatically calls ParkEaz every ~2 hours to re-register
- Each successful renewal appears in the log
- If ParkEaz grants a 12-hour window (overnight), the server skips renewals until that window nears expiry

**Notes for designer:**
- The countdown and status must be glanceable — the user checks their phone quickly and needs to know "am I good?" in under 1 second
- Status states:
  - **Active** — parking is registered, next renewal scheduled
  - **Renewing** — server is currently re-registering (brief, ~10 seconds)
  - **Error** — renewal failed, needs attention (this must be loud/alarming)
- The renewal log is secondary info — useful but not the primary focus

---

### 3.4 Session Expiry and Re-up

**Goal:** When the chosen duration is up, prompt the user to extend or stop.

**Flow:**
1. 15 minutes before the chosen duration expires, user receives a push notification:
   - "Your guest's parking expires in 15 minutes. Extend?"
   - Notification has an action button: "Extend"
2. If user taps "Extend" (from notification or from the app):
   - User sees the duration selection screen (same as step 4 in 3.2)
   - Presets: 2 hours, 4 hours, 8 hours, 12 hours, 24 hours, Overnight, Custom
   - User selects → server continues auto-renewing for the new duration
3. If user does nothing:
   - When the duration expires, the server stops renewing
   - User receives a final notification: "Guest parking has ended. Vehicle is no longer registered."
   - Session moves to history
4. If user taps notification but chooses not to extend:
   - Session ends, moves to history

**Notes for designer:**
- The 15-minute warning notification is the most critical notification in the app
- The extend flow should be as fast as possible — ideally 2 taps (notification → preset)
- Consider: what if the user is asleep and misses the notification? The session simply ends. The app does not auto-extend without user consent.

---

### 3.5 Stop Parking Early

**Goal:** User ends the session before the chosen duration.

**Flow:**
1. User taps "Stop Parking" on the active session screen
2. Confirmation dialog: "Stop parking for [PLATE]? The vehicle will no longer be registered after the current 2-hour window ends."
3. User confirms → server stops scheduling future renewals
4. The current 2-hour ParkEaz registration remains valid until its natural expiry
5. Session moves to history

**Notes for designer:**
- Make it clear that stopping doesn't immediately invalidate parking — the current 2-hour window finishes naturally
- This should require confirmation to prevent accidental taps

---

### 3.6 Error / Renewal Failure

**Goal:** If the server can't renew parking, alert the user urgently.

**Flow:**
1. Server attempts renewal and fails (ParkEaz is down, session expired, etc.)
2. Server retries automatically (up to 3 attempts)
3. If all retries fail:
   - User receives an urgent push notification: "Parking renewal failed for [PLATE]. Open app for details."
   - App shows error state on the active session screen with:
     - What went wrong (in plain language, e.g., "Couldn't connect to the parking system")
     - Time remaining before current parking expires
     - A "Retry Now" button
     - A fallback: "Register manually" link that opens the ParkEaz website
4. If retry succeeds → error clears, session returns to active state

**Notes for designer:**
- Error state must be the most attention-grabbing state in the app — a missed renewal = $250+ boot
- The manual fallback (open ParkEaz website) is critical — if the server truly can't renew, the user needs an escape hatch
- Show urgency relative to time: "Current parking expires in 45 minutes" vs "Current parking expires in 8 minutes" should feel very different

---

### 3.7 Session History

**Goal:** User can see past parking sessions.

**Flow:**
1. History tab shows a list of past sessions, newest first
2. Each entry shows:
   - Date
   - License plate
   - Total duration parked
   - How it ended (completed normally, stopped early, failed)
3. Tapping an entry shows detail:
   - Full renewal log (each 2-hour renewal with timestamp)
   - Any errors that occurred

**Notes for designer:**
- This is a low-priority screen — most users will rarely check it
- Keep it simple — a list with minimal detail, expandable for more

---

### 3.8 Settings

**Goal:** User can edit their profile and preferences.

**Flow:**
1. Settings screen has sections:
   - **Profile** — edit name, phone, email
   - **Saved Vehicles** — view/edit previously used license plates (app remembers plates from past sessions)
   - **Notifications** — toggle notification preferences (expiry warnings, renewal success logs)
   - **About** — app version, support contact

**Notes for designer:**
- No zone or guest code editing — these are app-level config managed by the developer
- Saved vehicles is a convenience feature — user can pick from past plates when starting a new session

---

## 4. Notification Inventory

| Trigger | Urgency | Message | Action Button |
|---------|---------|---------|---------------|
| 15 min before chosen duration ends | High | "Guest parking expires in 15 min. Extend?" | "Extend" |
| Chosen duration expired, session ended | Medium | "Guest parking has ended for [PLATE]." | "Start New" |
| Renewal failed after retries | Critical | "Parking renewal failed for [PLATE]! Open app." | "Open App" |
| Renewal failed, <15 min to current expiry | Critical | "URGENT: Parking for [PLATE] expires in [X] min and renewal failed!" | "Open App" |
| Successful renewal (optional, off by default) | Low | "Parking renewed for [PLATE]. Next renewal at [TIME]." | None |

---

## 5. Screen Inventory (for Designer)

| Screen | States | Priority |
|--------|--------|----------|
| Welcome / Onboarding | Single state | Medium |
| Profile Setup | Empty form, validation errors | Medium |
| Home — No Active Session | Empty state, with saved vehicle suggestions | High |
| Home — Active Session | Active, Renewing, Error | High (most important screen) |
| Duration Selection | Presets + custom picker | High |
| Session Confirmation | Summary before starting | Medium |
| Extend Duration | Same as duration selection, contextual header | High |
| Stop Parking Confirmation | Dialog/modal | Low |
| Error State | Retry + manual fallback | High |
| History — List | Empty state, populated list | Low |
| History — Detail | Renewal log, error details | Low |
| Settings | Profile, vehicles, notifications, about | Low |

---

## 6. Key UX Principles (for Designer)

1. **Glanceability is everything.** The active session screen will be checked 10x more than any other screen. Status and time remaining must be readable in under 1 second.

2. **Error states must be alarming.** A renewal failure is a $250 problem. The error state should feel urgent and impossible to miss.

3. **Minimum taps to park.** Returning users with a saved vehicle should be able to start parking in 2-3 taps: Start → [plate pre-filled] → duration preset → confirm.

4. **The app does one thing.** There's no payment, no map, no social features. It registers parking and keeps it alive. Every screen should reinforce this simplicity.

5. **Trust the server.** The app is a control panel for a server-side scheduler. The user doesn't need to keep the app open. The design should communicate: "You're covered. We'll wake you if there's a problem."

6. **Overnight is the killer scenario.** Guest stays the night → parking renews automatically → they sleep peacefully → morning renewals continue until chosen time. The UX should make "Overnight" feel safe and confident.

---

## 7. Out of Scope (v1)

- Multiple simultaneous guest vehicles per resident
- Guest self-service (guest downloads app independently)
- Payment integration (parking is free via guest code)
- Map / garage availability
- Resident-to-resident communication
- Admin panel for property management
- Changing the guest code or zone from within the app

---

## 8. Technical Context (for Designer Awareness Only)

- The app communicates with a server that handles all parking renewals
- Renewals happen every 2 hours during the day; the parking system grants 12 hours overnight (after 9 PM)
- The server renews even if the app is closed or the phone is off
- Push notifications are the primary channel for time-sensitive communication
- Platform: iOS first (React Native for future Android support)
