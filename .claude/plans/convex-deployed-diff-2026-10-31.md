# Deployed Convex source vs repository — 2026-10-31

Production deployment: `resolute-hummingbird-508` (project `backend`, team `fontez`).
Dev deployment used for testing: `dev:tidy-seal-196`.

## Files compared

Direct source recovery was not possible: the Convex dashboard no longer shows
module source (Functions panel has Statistics and Logs only; "Files" is file
storage; Deployment History is Pro-plan only). Comparison was done by
behavior, from `npx convex logs --prod --history 300` on 2026-10-31, against
the repository files at commit `16a57b3`.

- `convex/parkeaz.ts` (`parkeaz:renewalAction`)
- `convex/renewal.ts` (`renewal:tick`, `saveResult`, `handleFailure`)
- `convex/sessions.ts`, `convex/notifications.ts`, `convex/cronHandlers.ts`,
  `convex/users.ts`, `convex/vehicles.ts`, `convex/pushTokens.ts`

The deployed function list matches the repository exactly:
`cronHandlers:safetyNetScan`, `notifications:{sendExpiryWarning, sendSessionEnded, sendWeeklyCheckIn, sendRenewalFailure, sendUrgentFailure, push}`,
`notificationsHelpers:{getTokensForUser, pruneDeadTokens}`, `parkeaz:renewalAction`,
`pushTokens:save`, `renewal:{tick, saveResult, handleFailure}`,
`sessions:{getActive, getLastParked, listHistory, getDetail, create, extend, cancel, retry}`,
`users:{getProfile, upsertProfile, updateNotificationPrefs, updateMode, deleteAccount}`,
`vehicles:{list, add, remove}`.

## Deployed-only changes

- `parkeaz:renewalAction`: one additional `console.error` emitted between
  `Step 2 /charge: HTTP 200` and `Step 2 extracted parkId: unknown`, with the
  shape `[ParkEaz] FAILED_TO_EXTRACT_PARKID for session=… { finalUrl, status, bodyLength, htmlHead, htmlTail }`.
  Diagnostic only. Control flow is unchanged: the action continues to Step 3
  and logs `SUCCESS` with `parkId: "unknown"`, exactly as the repository's
  lines 291-379 do. The repository's `DEBUG`-gated body dump is the nearest
  equivalent.
- No other function shows behavior that differs from the repository source
  in the sampled logs (`renewal:tick` log lines match lines 31-33 of
  `convex/renewal.ts` verbatim).

## Carried forward into this plan

- `parkeaz.ts`: nothing. The whole action is deleted in Task 4; its extra
  log line has no successor.
- All other modules: nothing; no deployed-only behavior observed.

## Observed production defect (context for Task 4)

Since ParkEaz added the CAPTCHA, every production renewal attempt logs
`FAILED_TO_EXTRACT_PARKID`, then `SUCCESS` with `parkId: unknown`, and
`renewal:saveResult` keeps the session `active`. Users are shown as covered
while unregistered. Task 4's rewrite replaces this path entirely; the
`sweep` migration catches these sessions: an `active` session with a
future `lastParkEnd` whose `currentParkId` is `unknown`, or that has no
`renewalLogs` row with `source: "client"`, gets `lastParkEnd` and
`lapsedAt` set to now and one lapse push (`notifications.sendLapsePush`).
No due push is scheduled; the user re-registers from the app.
