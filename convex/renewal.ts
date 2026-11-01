import { v } from "convex/values";
import type { Scheduler } from "convex/server";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  computeDueAt,
  EXPIRY_WARNING_MS,
  shouldMarkLapsed,
  shouldSendDuePush,
} from "../src/domain/renewal";

type ScheduledId = Id<"_scheduled_functions">;

export async function cancelScheduled(
  ctx: { scheduler: Scheduler },
  id: ScheduledId | undefined,
): Promise<void> {
  if (!id) return;
  try {
    await ctx.scheduler.cancel(id);
  } catch {
    // Already fired or cancelled
  }
}

type PushIds = {
  duePushId: ScheduledId | undefined;
  lapsePushId: ScheduledId | undefined;
};

async function scheduleDue(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  parkEnd: number,
): Promise<ScheduledId> {
  return await ctx.scheduler.runAt(
    computeDueAt(parkEnd),
    internal.renewal.sendDuePush,
    { sessionId, scheduledForParkEnd: parkEnd },
  );
}

async function scheduleLapse(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  parkEnd: number,
): Promise<ScheduledId> {
  return await ctx.scheduler.runAt(parkEnd, internal.renewal.markLapsed, {
    sessionId,
    scheduledForParkEnd: parkEnd,
  });
}

/**
 * Replaces the due/lapse pushes for a session's newest registration.
 * Never schedules anything at or past the session's desiredEndTime.
 */
export async function scheduleRegistrationPushes(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  parkEnd: number,
): Promise<PushIds> {
  await cancelScheduled(ctx, session.duePushId);
  await cancelScheduled(ctx, session.lapsePushId);

  const { _id: sessionId, desiredEndTime } = session;
  const duePushId =
    computeDueAt(parkEnd) < desiredEndTime
      ? await scheduleDue(ctx, sessionId, parkEnd)
      : undefined;
  const lapsePushId =
    parkEnd < desiredEndTime
      ? await scheduleLapse(ctx, sessionId, parkEnd)
      : undefined;
  return { duePushId, lapsePushId };
}

/**
 * After desiredEndTime moves later, schedules the current registration's
 * pushes that were skipped for falling past the old end. Keeps existing
 * ids and never schedules a time already passed, so nothing fires twice.
 */
export async function fillMissingRegistrationPushes(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  desiredEndTime: number,
): Promise<PushIds> {
  const { _id: sessionId, lastParkEnd, duePushId, lapsePushId } = session;
  if (lastParkEnd === undefined || session.lapsedAt !== undefined) {
    return { duePushId, lapsePushId };
  }
  const now = Date.now();
  const isSchedulable = (at: number) => at > now && at < desiredEndTime;
  return {
    duePushId:
      duePushId ??
      (isSchedulable(computeDueAt(lastParkEnd))
        ? await scheduleDue(ctx, sessionId, lastParkEnd)
        : undefined),
    lapsePushId:
      lapsePushId ??
      (isSchedulable(lastParkEnd)
        ? await scheduleLapse(ctx, sessionId, lastParkEnd)
        : undefined),
  };
}

/** Cancels any previous end-of-session jobs and schedules new ones. */
export async function scheduleSessionEnd(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  desiredEndTime: number,
  previous: { expiryWarningId?: ScheduledId; completionId?: ScheduledId },
): Promise<{
  expiryWarningId: ScheduledId | undefined;
  completionId: ScheduledId;
}> {
  await cancelScheduled(ctx, previous.expiryWarningId);
  await cancelScheduled(ctx, previous.completionId);

  const warningTime = desiredEndTime - EXPIRY_WARNING_MS;
  const expiryWarningId =
    warningTime > Date.now()
      ? await ctx.scheduler.runAt(
          warningTime,
          internal.notifications.sendExpiryWarning,
          { sessionId },
        )
      : undefined;
  const completionId = await ctx.scheduler.runAt(
    desiredEndTime,
    internal.renewal.completeAtDesiredEnd,
    { sessionId },
  );
  return { expiryWarningId, completionId };
}

/** Cancels Extended Stay jobs; returns the patch fields for the migration. */
export async function clearExtendedState(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  now: number,
): Promise<{
  weeklyCheckInId: undefined;
  scheduledFunctionId: undefined;
  migratedFromExtendedAt: number;
}> {
  await cancelScheduled(ctx, session.weeklyCheckInId);
  await cancelScheduled(ctx, session.scheduledFunctionId);
  return {
    weeklyCheckInId: undefined,
    scheduledFunctionId: undefined,
    migratedFromExtendedAt: now,
  };
}

export const sendDuePush = internalMutation({
  args: { sessionId: v.id("sessions"), scheduledForParkEnd: v.number() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;
    if (!shouldSendDuePush(session, args.scheduledForParkEnd)) return;

    await ctx.scheduler.runAfter(0, internal.notifications.sendDuePush, {
      sessionId: args.sessionId,
    });
  },
});

export const markLapsed = internalMutation({
  args: { sessionId: v.id("sessions"), scheduledForParkEnd: v.number() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;
    const now = Date.now();
    if (!shouldMarkLapsed(session, args.scheduledForParkEnd, now)) return;

    await ctx.db.patch(args.sessionId, { lapsedAt: now });
    await ctx.db.insert("renewalLogs", {
      sessionId: args.sessionId,
      action: "lapsed",
    });
    await ctx.scheduler.runAfter(0, internal.notifications.sendLapsePush, {
      sessionId: args.sessionId,
    });
  },
});

export const completeAtDesiredEnd = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "active") return;

    await cancelScheduled(ctx, session.duePushId);
    await cancelScheduled(ctx, session.lapsePushId);
    await cancelScheduled(ctx, session.expiryWarningId);
    await ctx.db.patch(args.sessionId, {
      status: "completed",
      duePushId: undefined,
      lapsePushId: undefined,
      expiryWarningId: undefined,
      completionId: undefined,
    });
    await ctx.db.insert("renewalLogs", {
      sessionId: args.sessionId,
      action: "completed",
    });
    await ctx.scheduler.runAfter(0, internal.notifications.sendSessionEnded, {
      sessionId: args.sessionId,
    });
  },
});
