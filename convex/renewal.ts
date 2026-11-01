import { v } from "convex/values";
import type { Scheduler } from "convex/server";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  EXPIRY_WARNING_MS,
  planRegistrationPushes,
  shouldMarkLapsed,
  shouldSendDuePush,
  type RegistrationPushPlan,
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

// Performs only the runAt calls a plan asks for; the decisions live in
// planRegistrationPushes.
async function schedulePlan(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  parkEnd: number,
  plan: RegistrationPushPlan,
): Promise<{ due?: ScheduledId; lapse?: ScheduledId }> {
  const args = { sessionId, scheduledForParkEnd: parkEnd };
  const due =
    plan.due === null
      ? undefined
      : await ctx.scheduler.runAt(plan.due, internal.renewal.sendDuePush, args);
  const lapse =
    plan.lapse === null
      ? undefined
      : await ctx.scheduler.runAt(
          plan.lapse,
          internal.renewal.markLapsed,
          args,
        );
  return { due, lapse };
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

  const plan = planRegistrationPushes({
    parkEnd,
    desiredEndTime: session.desiredEndTime,
    now: null,
    existing: {},
  });
  const ids = await schedulePlan(ctx, session._id, parkEnd, plan);
  return { duePushId: ids.due, lapsePushId: ids.lapse };
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
  const { lastParkEnd, duePushId, lapsePushId } = session;
  if (lastParkEnd === undefined || session.lapsedAt !== undefined) {
    return { duePushId, lapsePushId };
  }
  const plan = planRegistrationPushes({
    parkEnd: lastParkEnd,
    desiredEndTime,
    now: Date.now(),
    existing: {
      duePushId: duePushId !== undefined,
      lapsePushId: lapsePushId !== undefined,
    },
  });
  const ids = await schedulePlan(ctx, session._id, lastParkEnd, plan);
  return {
    duePushId: duePushId ?? ids.due,
    lapsePushId: lapsePushId ?? ids.lapse,
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
