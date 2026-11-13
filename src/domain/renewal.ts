import { easternParts, nextEasternWallClock } from "./easternTime";

export const REGISTRATION_MS = 2 * 60 * 60 * 1000;
export const DUE_BUFFER_MS = 10 * 60 * 1000;
export const DAILY_DURATION_MS = 24 * 60 * 60 * 1000;
export const EXPIRY_WARNING_MS = 15 * 60 * 1000;
export const TOKEN_WINDOW_MS = 2 * 60 * 1000;

// ParkEaz sells 2 h by day and, from 9 PM, a single block that ends at a
// fixed 10:00 AM Eastern: 13 h on the wall clock, 14 h of real time on the
// DST fall-back night. A page value is trusted up to this span plus slack.
export const MAX_COVERAGE_MS = 14 * 60 * 60 * 1000;
export const PARK_END_SLACK_MS = 15 * 60 * 1000;
export const OVERNIGHT_START_HOUR = 21;
export const OVERNIGHT_END_HOUR = 10;

export type CoverageEndSource = "page" | "checkout" | "model";

// Last-resort coverage end when neither the success page nor the checkout
// page gave one.
export function modelCoverageEnd(now: number): number {
  const { hour } = easternParts(now);
  const isOvernight =
    hour >= OVERNIGHT_START_HOUR || hour < OVERNIGHT_END_HOUR;
  return isOvernight
    ? nextEasternWallClock(now, OVERNIGHT_END_HOUR)
    : now + REGISTRATION_MS;
}

const GUEST_CODE_PATTERN = /^[A-Z0-9]{4,12}$/;

export const GUEST_CODE_UNAVAILABLE_MESSAGE =
  "Parking registration is temporarily unavailable. Try again later.";

export type RenewalSessionLike = {
  status: string;
  desiredEndTime: number;
  lastParkEnd?: number;
  lapsedAt?: number;
  dueAt?: number;
  currentParkId?: string;
};

export type SessionState =
  | { kind: "awaiting_first" }
  | { kind: "registered"; until: number }
  | { kind: "due"; until: number }
  | { kind: "unregistered"; since: number }
  | { kind: "done" };

export function isFinished(status: string): boolean {
  return status === "completed" || status === "cancelled";
}

function isCurrentRegistration(
  session: RenewalSessionLike,
  scheduledForParkEnd: number,
): boolean {
  return (
    !isFinished(session.status) && session.lastParkEnd === scheduledForParkEnd
  );
}

export function deriveSessionState(
  session: RenewalSessionLike,
  now: number,
): SessionState {
  if (isFinished(session.status)) return { kind: "done" };
  const { lastParkEnd, dueAt } = session;
  if (lastParkEnd === undefined) return { kind: "awaiting_first" };
  if (now >= lastParkEnd) return { kind: "unregistered", since: lastParkEnd };
  if (dueAt !== undefined && now >= dueAt) {
    return { kind: "due", until: lastParkEnd };
  }
  return { kind: "registered", until: lastParkEnd };
}

export function computeDueAt(parkEnd: number): number {
  return parkEnd - DUE_BUFFER_MS;
}

export function shouldSendDuePush(
  session: RenewalSessionLike,
  scheduledForParkEnd: number,
): boolean {
  return isCurrentRegistration(session, scheduledForParkEnd);
}

export function shouldMarkLapsed(
  session: RenewalSessionLike,
  scheduledForParkEnd: number,
  now: number,
): boolean {
  return (
    isCurrentRegistration(session, scheduledForParkEnd) &&
    now >= scheduledForParkEnd &&
    session.lapsedAt === undefined
  );
}

export function isDuplicateRegistration(
  session: RenewalSessionLike,
  parkId: string,
): boolean {
  return session.currentParkId === parkId;
}

export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeGuestCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return GUEST_CODE_PATTERN.test(code) ? code : null;
}

export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

export type RegistrationPushPlan = {
  due: number | null;
  lapse: number | null;
};

/**
 * Times to schedule the due and lapse pushes for the newest registration.
 * Nothing at or past desiredEndTime, nothing already scheduled. `now: null`
 * means a fresh registration, where an elapsed time still fires at once;
 * with a number, times at or before it are skipped so nothing fires twice.
 */
export function planRegistrationPushes(args: {
  parkEnd: number;
  desiredEndTime: number;
  now: number | null;
  existing: { duePushId?: boolean; lapsePushId?: boolean };
}): RegistrationPushPlan {
  const { parkEnd, desiredEndTime, now, existing } = args;
  const isSchedulable = (at: number) =>
    at < desiredEndTime && (now === null || at > now);
  const dueAt = computeDueAt(parkEnd);
  return {
    due: !existing.duePushId && isSchedulable(dueAt) ? dueAt : null,
    lapse: !existing.lapsePushId && isSchedulable(parkEnd) ? parkEnd : null,
  };
}

export type CoverageSessionLike = {
  desiredEndTime: number;
  lastParkEnd?: number;
  _creationTime: number;
};

// Legacy Extended Stay sessions store MAX_SAFE_INTEGER as desiredEndTime.
export function coverageEndFor(session: CoverageSessionLike): number {
  if (session.desiredEndTime !== Number.MAX_SAFE_INTEGER) {
    return session.desiredEndTime;
  }
  return session.lastParkEnd ?? session._creationTime;
}
