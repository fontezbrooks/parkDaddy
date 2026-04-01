# parkDaddy — System Design Document

## References
- PRD: `.claude/plans/parkdaddy-prd-v4.md`
- Stitch Designs: `stitch_parkdaddy/`
- ParkEaz Network Calls: `docs/Ponce Park Assist.md`

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Mobile App                        │
│  Expo (latest) + Expo Router + Clerk + Convex React  │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │  (auth)  │  │  (tabs)  │  │  Stack Screens   │   │
│  │ welcome  │  │  Home    │  │  start-parking   │   │
│  │ sign-in  │  │  History │  │  review-session  │   │
│  │ sign-up  │  │  Settings│  │  extend-duration │   │
│  │ profile  │  │          │  │  confirm-stop    │   │
│  └──────────┘  └──────────┘  └──────────────────┘   │
│                      │                               │
│              useQuery / useMutation                   │
│              (real-time subscriptions)                │
└──────────────────────┬───────────────────────────────┘
                       │ HTTPS (JWT auth via Clerk)
┌──────────────────────▼───────────────────────────────┐
│                  Convex Backend                       │
│                                                      │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  Queries   │  │  Mutations   │  │   Actions    │ │
│  │ getActive  │  │ createSession│  │  (Node.js)   │ │
│  │ listHistory│  │ extendSession│  │ parkeazBook  │ │
│  │ getProfile │  │ cancelSession│  │ parkeazRenew │ │
│  │ listVehicle│  │ retryRenewal │  │              │ │
│  └────────────┘  └──────┬───────┘  └──────┬───────┘ │
│                         │                  │         │
│  ┌──────────────────────▼──────────────────▼───────┐ │
│  │           Renewal Engine (Internal)             │ │
│  │  renewalTick (mutation) → renewalAction (action)│ │
│  │  ctx.scheduler.runAfter() for next renewal      │ │
│  │  Cron safety net every 30 min                   │ │
│  └─────────────────────────────────────────────────┘ │
│                         │                            │
│  ┌──────────────────────▼──────────────────────────┐ │
│  │              Convex Document DB                 │ │
│  │  users | vehicles | sessions | renewalLogs |    │ │
│  │  pushTokens                                     │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────┬───────────────────────────────┘
                       │ HTTPS (cookie jar managed server-side)
┌──────────────────────▼───────────────────────────────┐
│              ParkEaz API (Third Party)                │
│  POST /checkout → POST /charge → GET /successful_tx  │
│  PHPSESSID cookie for session continuity             │
└──────────────────────────────────────────────────────┘
```

**Key architectural decisions:**
- All ParkEaz API calls happen exclusively on the server (Convex Node actions). The client never touches ParkEaz.
- Renewal scheduling uses Convex's native `ctx.scheduler.runAfter()`. No external job queue.
- Real-time UI updates via Convex subscriptions — no polling.
- Clerk handles all auth. Convex validates JWT on every request.

---

## 2. Convex Schema

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    mobile: v.string(),
    notifyOnExpiry: v.boolean(),       // default true
    notifyOnSuccess: v.boolean(),      // default false
  })
    .index("by_clerk_id", ["clerkId"]),

  vehicles: defineTable({
    userId: v.id("users"),
    plate: v.string(),
    makeModel: v.optional(v.string()),
    color: v.optional(v.string()),
    lastUsedAt: v.number(),            // unix ms, for sorting
  })
    .index("by_user", ["userId"]),

  sessions: defineTable({
    userId: v.id("users"),
    vehicleId: v.optional(v.id("vehicles")),
    plate: v.string(),
    firstName: v.string(),             // denormalized from user for ParkEaz calls
    lastName: v.string(),
    email: v.string(),
    mobile: v.string(),
    desiredEndTime: v.number(),        // unix ms — when user wants parking to end
    status: v.string(),                // "active" | "renewing" | "failed" | "cancelled" | "completed"
    currentParkId: v.optional(v.string()),
    lastParkStart: v.optional(v.number()),
    lastParkEnd: v.optional(v.number()),
    nextRenewalAt: v.optional(v.number()),
    scheduledFunctionId: v.optional(v.id("_scheduled_functions")),
    parkeazCookieJson: v.optional(v.string()),  // serialized tough-cookie jar
    retryCount: v.number(),            // resets to 0 on success
    lastError: v.optional(v.string()),
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_status", ["status"])
    .index("by_next_renewal", ["status", "nextRenewalAt"]),

  renewalLogs: defineTable({
    sessionId: v.id("sessions"),
    action: v.string(),                // "initial" | "renewal" | "retry" | "failure" | "completed" | "cancelled"
    parkId: v.optional(v.string()),
    parkStart: v.optional(v.number()),
    parkEnd: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_session", ["sessionId"]),

  pushTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    platform: v.string(),              // "ios" | "android"
  })
    .index("by_user", ["userId"]),
});
```

**Index rationale:**
- `sessions.by_user_status` — query active session for a user (the primary home screen query)
- `sessions.by_status` — cron safety net scans all active sessions
- `sessions.by_next_renewal` — cron finds sessions with overdue renewals
- `renewalLogs.by_session` — display renewal history for a session

---

## 3. Convex Functions

### 3.1 Public Queries (client-callable)

| Function | File | Args | Returns | Purpose |
|----------|------|------|---------|---------|
| `getProfile` | `users.ts` | none (auth) | User or null | Get current user profile |
| `getActiveSession` | `sessions.ts` | none (auth) | Session + renewalLogs or null | Home screen: active session with logs |
| `listHistory` | `sessions.ts` | none (auth) | Session[] | History screen: past sessions |
| `getSessionDetail` | `sessions.ts` | `{ sessionId }` | Session + renewalLogs | History detail: full renewal log |
| `listVehicles` | `vehicles.ts` | none (auth) | Vehicle[] | Saved vehicles list |

### 3.2 Public Mutations (client-callable)

| Function | File | Args | Returns | Purpose |
|----------|------|------|---------|---------|
| `upsertProfile` | `users.ts` | `{ firstName, lastName, email, mobile }` | User ID | Create/update user profile after Clerk sign-up |
| `createSession` | `sessions.ts` | `{ plate, makeModel?, color?, durationMinutes }` | Session ID | Start parking: validate no active session, save vehicle, trigger initial booking |
| `extendSession` | `sessions.ts` | `{ sessionId, additionalMinutes }` | void | Add time to active session |
| `cancelSession` | `sessions.ts` | `{ sessionId }` | void | Stop parking: cancel scheduled renewal |
| `retryRenewal` | `sessions.ts` | `{ sessionId }` | void | Manual retry from error state |
| `addVehicle` | `vehicles.ts` | `{ plate, makeModel?, color? }` | Vehicle ID | Manually add a vehicle |
| `deleteVehicle` | `vehicles.ts` | `{ vehicleId }` | void | Remove saved vehicle |
| `savePushToken` | `pushTokens.ts` | `{ token, platform }` | void | Register Expo push token |

### 3.3 Internal Functions (server-only)

| Function | Type | File | Purpose |
|----------|------|------|---------|
| `renewalTick` | internalMutation | `renewal.ts` | State machine: check session → schedule action → handle result |
| `renewalAction` | internalAction | `parkeaz.ts` | Execute 3-step ParkEaz API flow (Node runtime) |
| `saveRenewalResult` | internalMutation | `renewal.ts` | Write renewal result to DB, schedule next tick |
| `handleRenewalFailure` | internalMutation | `renewal.ts` | Increment retry, schedule retry or mark failed |
| `sendNotification` | internalAction | `notifications.ts` | Send Expo push notification |
| `scheduleExpiryWarning` | internalMutation | `notifications.ts` | Schedule 15-min-before-expiry notification |
| `safetyNetScan` | internalMutation | `crons.ts` | Find sessions with overdue renewals, re-trigger |

### 3.4 Crons

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("renewal safety net", { minutes: 30 }, internal.crons.safetyNetScan);

export default crons;
```

---

## 4. ParkEaz Client Design

### 4.1 API Flow (Node Action)

```typescript
// convex/parkeaz.ts — "use node"
// Single exported internalAction: renewalAction

// Flow:
// 1. If no cookie jar → GET /checkout page to obtain PHPSESSID
// 2. POST /checkout with form data
// 3. Parse response to extract any server-generated values
// 4. POST /charge with parkstart/parkend/pricing
// 5. Parse response to extract parkid
// 6. GET /successful_transaction?parkid=X&zone=622&remember=0
// 7. Return { parkId, parkStart, parkEnd, cookieJson }
```

### 4.2 Request Payloads

**POST /checkout body:**
```
tenant=
spacenumber=
mobile=<MOBILE>
email=<EMAIL>
firstname=<FIRST>
lastname=<LAST>
vehiclemake=<MAKE_OR_BLANK>
vehiclemodel=<MODEL_OR_BLANK>
vehiclecolor=<COLOR_OR_BLANK>
vehiclestate=
couponcode=
guestcode=<GUEST_CODE>
postalcode=
product=3615
zone=622
zoneid=247
propertyid=202
plate=<PLATE>
parkstart=<YYYY-MM-DD+HH:MM:SS>
extension=0
```

Note: Some fields appear twice in the captured request (mobile, email, guestcode, couponcode). The first occurrence is blank, the second has the value. Replicate this pattern.

**POST /charge body:**
```
parkstart=<YYYY-MM-DD+HH:MM:SS>
parkend=<YYYY-MM-DD+HH:MM:SS>       // parkstart + 2 hours (or overnight)
zone=622
zoneid=247
propertyid=202
propertyname=Ponce+Springs+Lofts
plate=<PLATE>
tenantid=
email=<EMAIL>
mobile=<MOBILE>
parkallowtextalert=Off
spacenumber=
firstname=<FIRST>
lastname=<LAST>
vehiclemake=
vehiclemodel=
vehiclecolor=
vehiclestate=
product=3615
producttime=120
couponid=0
coupondiscount=0
couponpriceadded=0
productprice=0.00
transactionfee=0
totalcharge=0
stripeprice=0
extension=0
guestcode=<GUEST_CODE>
```

**GET /successful_transaction:**
```
/successful_transaction?parkid=<PARKID>&zone=622&remember=0
```

### 4.3 Cookie Management

```
// Pseudo-code for cookie lifecycle:
1. Create new CookieJar (tough-cookie)
2. GET any page on paid.parkeaz.com → jar captures PHPSESSID
3. Use jar for POST /checkout and POST /charge
4. After /successful_transaction, jar has additional cookies (plate, name, etc.)
5. Serialize: JSON.stringify(jar.toJSON())
6. Store serialized string in sessions.parkeazCookieJson
7. On next renewal: CookieJar.fromJSON(JSON.parse(stored))
8. If renewal fails after 3 retries → clear jar, get fresh PHPSESSID, retry once
```

### 4.4 Response Parsing

ParkEaz returns HTML, not JSON. Key extraction points:
- `parkid` — needed for `/successful_transaction` call. Likely in a hidden form field or redirect URL after `/charge`.
- `parkend` — the server-confirmed end time. May differ from our calculated time (especially overnight).

Strategy: Parse HTML with regex or a lightweight parser. Store fixture responses for test coverage. If HTML structure changes, the manual fallback link to ParkEaz website is the escape hatch.

---

## 5. Renewal Engine State Machine

```
                    ┌─────────────┐
    createSession → │   active    │ ← retryRenewal (success)
                    └──────┬──────┘
                           │ scheduler fires 10 min before parkend
                    ┌──────▼──────┐
                    │  renewing   │
                    └──────┬──────┘
                    ┌──────┴──────┐
               success           failure
                    │             │
            ┌───────▼───┐   ┌────▼────┐
            │  active   │   │ retry   │ (up to 3x same cookie)
            │ (or done) │   │         │ → 1x fresh cookie
            └───────────┘   └────┬────┘
                                 │ all retries exhausted
                          ┌──────▼──────┐
                          │   failed    │ → push notification
                          └──────┬──────┘
                                 │ user taps "Retry Now"
                          ┌──────▼──────┐
                          │  renewing   │ → back to top
                          └─────────────┘

    cancelSession → cancelled (from any state except completed)
    desiredEndTime reached + last parkend covers it → completed
```

### 5.1 Renewal Tick Logic (internalMutation)

```
renewalTick(sessionId):
  session = db.get(sessionId)
  
  // Guard clauses
  if session.status in ["cancelled", "completed", "failed"] → return
  
  // Check if we're done
  if session.lastParkEnd >= session.desiredEndTime → mark completed, return
  
  // Mark renewing
  db.patch(session, { status: "renewing" })
  
  // Schedule the action
  scheduler.runAfter(0, renewalAction, {
    sessionId,
    cookieJson: session.parkeazCookieJson,
    plate, firstName, lastName, email, mobile
  })
```

### 5.2 Renewal Action Logic (internalAction, "use node")

```
renewalAction(args):
  // Execute ParkEaz 3-step flow
  result = parkeazClient.book(args)
  
  if success:
    runMutation(saveRenewalResult, {
      sessionId, parkId, parkStart, parkEnd, cookieJson
    })
  else:
    runMutation(handleRenewalFailure, {
      sessionId, error: errorMessage
    })
```

### 5.3 Save Result Logic (internalMutation)

```
saveRenewalResult(sessionId, parkId, parkStart, parkEnd, cookieJson):
  session = db.get(sessionId)
  
  // Log the renewal
  db.insert("renewalLogs", { sessionId, action: "renewal", parkId, parkStart, parkEnd })
  
  // Reset retry count
  db.patch(session, {
    status: "active",
    currentParkId: parkId,
    lastParkStart: parkStart,
    lastParkEnd: parkEnd,
    parkeazCookieJson: cookieJson,
    retryCount: 0,
    lastError: undefined
  })
  
  // Check if parking now covers desired end time
  if parkEnd >= session.desiredEndTime:
    db.patch(session, { status: "completed" })
    log "completed"
    send completion notification
    return
  
  // Schedule next renewal: 10 min before parkEnd
  bufferMs = 10 * 60 * 1000
  nextRenewalAt = parkEnd - bufferMs
  scheduledId = scheduler.runAt(nextRenewalAt, renewalTick, { sessionId })
  
  db.patch(session, {
    nextRenewalAt,
    scheduledFunctionId: scheduledId
  })
```

### 5.4 Failure Handling (internalMutation)

```
handleRenewalFailure(sessionId, error):
  session = db.get(sessionId)
  newRetryCount = session.retryCount + 1
  
  if newRetryCount <= 3:
    // Retry with same cookie, exponential backoff
    delay = 2^newRetryCount * 5000  // 10s, 20s, 40s
    db.patch(session, { retryCount: newRetryCount, lastError: error })
    scheduler.runAfter(delay, renewalTick, { sessionId })
  
  else if newRetryCount == 4:
    // One fresh cookie attempt
    db.patch(session, { retryCount: 4, parkeazCookieJson: undefined, lastError: error })
    scheduler.runAfter(5000, renewalTick, { sessionId })
  
  else:
    // All retries exhausted
    db.patch(session, { status: "failed", lastError: error })
    log "failure"
    
    // Send push notification
    timeToExpiry = session.lastParkEnd - Date.now()
    if timeToExpiry < 15 * 60 * 1000:
      sendNotification(session.userId, "URGENT", ...)
    else:
      sendNotification(session.userId, "FAILURE", ...)
```

---

## 6. Expo Router File Structure

```
app/
  _layout.tsx                    # Root: ClerkProvider → ConvexProviderWithClerk → Stack
  (auth)/
    _layout.tsx                  # Stack layout, redirects signed-in users to (tabs)
    welcome.tsx                  # Welcome screen with "Get Started" / "Sign In"
    sign-in.tsx                  # Clerk sign-in form
    sign-up.tsx                  # Clerk sign-up form
    profile-setup.tsx            # Post-signup: first name, last name, phone
  (tabs)/
    _layout.tsx                  # Tabs layout, redirects signed-out users to (auth)
    index.tsx                    # Home: dual-state (inactive / active / error)
    history.tsx                  # Session history list
    settings.tsx                 # Profile, vehicles, notifications, sign-out
  start-parking.tsx              # Stack: enter plate + select duration
  review-session.tsx             # Stack: confirmation before starting
  extend-duration.tsx            # Stack: add time to active session
  confirm-stop.tsx               # Modal: stop parking confirmation
```

### 6.1 Root Layout

```typescript
// app/_layout.tsx
// Providers: ClerkProvider (outermost) → ConvexProviderWithClerk → Stack
// Push notification listener registered here
// Stack screens:
//   (auth) — headerShown: false
//   (tabs) — headerShown: false
//   start-parking — title: "Start Parking"
//   review-session — title: "Review Session"
//   extend-duration — title: "Extend Parking"
//   confirm-stop — presentation: "modal"
```

### 6.2 Auth Layout

```typescript
// app/(auth)/_layout.tsx
// useAuth() from @clerk/expo
// If signed in AND has profile → Redirect to /(tabs)
// If signed in AND no profile → Redirect to profile-setup
// Otherwise → render Stack (welcome, sign-in, sign-up, profile-setup)
```

### 6.3 Tabs Layout

```typescript
// app/(tabs)/_layout.tsx
// useAuth() from @clerk/expo
// If not signed in → Redirect to /(auth)/welcome
// Tabs: Home (index), History, Settings
// Tab bar icons: home, clock/history, settings gear
// Tab bar style: matches design system (surface background, primary active tint)
```

---

## 7. Component Hierarchy

### 7.1 Shared Components (`src/components/`)

| Component | Props | Used By | Design Reference |
|-----------|-------|---------|------------------|
| `GradientButton` | `title, onPress, variant?, disabled?` | All screens | Primary CTA: gradient primary→primary_container |
| `StatusPill` | `status: "active" \| "renewing" \| "failed"` | Home (active) | Teal/yellow/red pill with optional pulse |
| `CountdownTimer` | `targetTime: number` | Home (active), Renewal Failure | Display-scale tabular-nums, updates every second |
| `DurationPresetGrid` | `selected, onSelect, presets` | Start Parking, Extend Duration | 3-column grid of duration buttons |
| `VehicleCard` | `plate, makeModel?, onPress?` | Home (inactive), Settings | Plate display with optional tap action |
| `SessionSummary` | `plate, duration, endTime, renewalCount` | Review Session, Extend Duration | Confirmation info card |
| `GlassPanel` | `children` | Active session hero | Glass morphism container |
| `SurfaceCard` | `children, level?` | Multiple | Tonal layering container (level 0/1/2) |
| `AlarmHeader` | `message, countdown?` | Home (error state) | Full-width secondary background |
| `RenewalLogList` | `logs: RenewalLog[]` | Home (active), History detail | Timestamp list of renewals |

### 7.2 Screen Composition

**Home Screen (inactive state):**
```
SafeAreaView
  ├── Header ("parkDaddy" + avatar)
  ├── EmptyState (icon + "No active session" message)
  ├── GradientButton ("START NEW PARKING SESSION")
  ├── SectionHeader ("SAVED VEHICLES")
  └── FlatList<VehicleCard>
```

**Home Screen (active state):**
```
SafeAreaView
  ├── Header ("parkDaddy" + avatar)
  ├── StatusPill (active/renewing)
  ├── SessionHeroCard (primary gradient background)
  │   ├── CountdownTimer (large, glass pill)
  │   ├── GlassPanel (end time)
  │   └── InfoGrid (plate + zone)
  ├── RenewalLogList (last renewed + next scheduled)
  ├── GradientButton ("Extend Time")
  └── OutlineButton ("Stop Parking")
```

**Home Screen (error state):**
```
SafeAreaView
  ├── AlarmHeader ("RENEWAL FAILED" + full-width red)
  ├── CountdownTimer (time to current expiry)
  ├── ErrorCard (plain-language error + plate/zone)
  ├── GradientButton ("Retry Now" — secondary color)
  └── LinkText ("Register Manually at ParkEaz")
```

---

## 8. Push Notification Architecture

### 8.1 Token Registration

```
App launch → Notifications.getExpoPushTokenAsync({ projectId })
  → savePushToken mutation → stored in pushTokens table
```

### 8.2 Notification Scheduling

Notifications are triggered by Convex mutations, sent via Convex actions:

| Event | Trigger Point | Implementation |
|-------|---------------|----------------|
| 15-min expiry warning | `saveRenewalResult` schedules `sendNotification` at `desiredEndTime - 15min` | `scheduler.runAt()` |
| Session completed | `saveRenewalResult` when `parkEnd >= desiredEndTime` | Immediate `scheduler.runAfter(0, ...)` |
| Renewal failure | `handleRenewalFailure` when retries exhausted | Immediate `scheduler.runAfter(0, ...)` |
| Urgent failure | `handleRenewalFailure` when <15min to `lastParkEnd` | Immediate `scheduler.runAfter(0, ...)` |

### 8.3 Notification Action Handling

```
// In app/_layout.tsx:
// Listen for notification response → extract data.route
// router.push(data.route) — e.g., "/extend-duration" or "/(tabs)"
```

Notification payload format:
```json
{
  "to": "<ExpoPushToken>",
  "title": "Parking expires in 15 min",
  "body": "Extend parking for CPM2150?",
  "data": {
    "route": "/extend-duration",
    "sessionId": "<session_id>"
  },
  "categoryId": "PARKING_ALERT"
}
```

---

## 9. Environment Variables

### Convex Dashboard (server-side, never exposed to client)

| Variable | Value | Purpose |
|----------|-------|---------|
| `PARKEAZ_GUEST_CODE` | `MTDJR7` | Guest code for ParkEaz API |
| `PARKEAZ_BASE_URL` | `https://paid.parkeaz.com` | ParkEaz API base URL |
| `EXPO_ACCESS_TOKEN` | `<from expo.dev>` | For sending push notifications via Expo's API |
| `CLERK_JWT_ISSUER_DOMAIN` | `https://funny-sunbeam-94.clerk.accounts.dev` | Clerk JWT validation |

### `.env` (client-side, committed to repo is fine for public keys)

| Variable | Value | Purpose |
|----------|-------|---------|
| `EXPO_PUBLIC_CONVEX_URL` | `https://tidy-seal-196.convex.cloud` | Convex deployment URL |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_ZnVubnktc3VuYmVhbS05NC5jbGVyay5hY2NvdW50cy5kZXYk` | Clerk publishable key |

---

## 10. Dependencies

### Expo / React Native

| Package | Purpose |
|---------|---------|
| `expo` | Core framework (latest SDK) |
| `expo-router` | File-based routing |
| `expo-notifications` | Push notification registration + handling |
| `expo-font` | Inter font loading |
| `expo-constants` | App config + EAS project ID |
| `expo-secure-store` | Clerk token cache storage |
| `expo-linking` | Deep links from notifications |
| `react-native-reanimated` | Animations (countdown pulse, status pill) |
| `react-native-safe-area-context` | Safe area insets |
| `@clerk/clerk-expo` | Clerk auth provider + hooks |
| `convex` | Convex React client + hooks |

### Convex Backend (Node dependencies)

| Package | Purpose |
|---------|---------|
| `tough-cookie` | PHPSESSID cookie jar management |
| `node-fetch` | HTTP requests in Node actions (or use native fetch) |
| `expo-server-sdk` | Send Expo push notifications from server |

---

## 11. Data Flow Diagrams

### 11.1 Start Parking Flow

```
Guest taps "Confirm & Start"
  → useMutation(api.sessions.createSession)
    → Mutation: validate no active session
    → Mutation: upsert vehicle (save plate for future use)
    → Mutation: create session record (status: "active")
    → Mutation: scheduler.runAfter(0, renewalTick)
      → renewalTick (mutation): mark "renewing", schedule action
        → renewalAction (action, Node): 
            GET /checkout page → obtain PHPSESSID
            POST /checkout → register
            POST /charge → confirm ($0.00)
            GET /successful_transaction → get parkId
          → runMutation(saveRenewalResult)
            → Update session: status "active", parkId, parkEnd
            → Insert renewalLog
            → Schedule next renewalTick at (parkEnd - 10min)
            → Schedule expiryWarning at (desiredEndTime - 15min)
  → useQuery(api.sessions.getActiveSession) auto-updates UI
```

### 11.2 Extend Duration Flow

```
Guest selects new duration, taps "Confirm Extension"
  → useMutation(api.sessions.extendSession)
    → Mutation: update desiredEndTime (current + additional)
    → Mutation: cancel existing expiryWarning scheduled function
    → Mutation: schedule new expiryWarning at (newDesiredEndTime - 15min)
    → (Renewal schedule unchanged — renewalTick already running on its cycle)
  → UI countdown updates via real-time subscription
```

### 11.3 Cancel Session Flow

```
Guest taps "Stop Parking" → confirms in modal
  → useMutation(api.sessions.cancelSession)
    → Mutation: cancel scheduledFunctionId (next renewalTick)
    → Mutation: cancel expiryWarning
    → Mutation: set status "cancelled"
    → Insert renewalLog (action: "cancelled")
  → Current ParkEaz registration remains valid until lastParkEnd
  → Session appears in history
```

---

## 12. Security Considerations

1. **ParkEaz credentials never reach the client.** Guest code, PHPSESSID, and all API payloads are server-side only.
2. **Auth on every Convex call.** All public queries/mutations call `ctx.auth.getUserIdentity()` and reject unauthenticated requests.
3. **User isolation.** Sessions are queried with `userId` filter — users cannot see or modify other users' sessions.
4. **Cookie encryption at rest.** The `parkeazCookieJson` field contains session cookies. Convex data is encrypted at rest by default. Additional application-level encryption is optional for v1.
5. **No secrets in client code.** Only `EXPO_PUBLIC_*` vars reach the client (Convex URL + Clerk publishable key — both are public by design).

---

## 13. Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| ParkEaz Client | Payload serialization, cookie management, HTML response parsing | Unit tests with fixture HTML responses |
| Renewal Engine | State machine transitions, retry logic, scheduling | Convex test framework with mocked actions |
| Session Lifecycle | Create, extend, cancel, complete flows | Integration tests against Convex dev deployment |
| Overnight Logic | Timing derivation from server-confirmed parkEnd | Unit tests with various parkEnd values |
| Push Notifications | Token registration, notification payload format | Unit tests for payload construction |
| Auth Guards | Unauthenticated rejection, user isolation | Integration tests with/without auth |

### Fixture Strategy

Save actual ParkEaz HTML responses as test fixtures:
- `fixtures/checkout_success.html`
- `fixtures/charge_success.html`
- `fixtures/successful_transaction.html`
- `fixtures/checkout_error.html` (if obtainable)

Parse these in tests to verify extraction logic remains correct if HTML structure changes.
