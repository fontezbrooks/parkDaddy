import { v } from "convex/values";
import type { Scheduler } from "convex/server";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  computeDueAt,
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

/**
 * Replaces the due/lapse pushes for a session's newest registration.
 * Never schedules anything at or past the session's desiredEndTime.
 */
export async function scheduleRegistrationPushes(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  parkEnd: number,
): Promise<{
  duePushId: ScheduledId | undefined;
  lapsePushId: ScheduledId | undefined;
}> {
  await cancelScheduled(ctx, session.duePushId);
  await cancelScheduled(ctx, session.lapsePushId);

  const sessionId = session._id;
  const dueAt = computeDueAt(parkEnd);
  const duePushId =
    dueAt < session.desiredEndTime
      ? await ctx.scheduler.runAt(dueAt, internal.renewal.sendDuePush, {
          sessionId,
          scheduledForParkEnd: parkEnd,
        })
      : undefined;
  const lapsePushId =
    parkEnd < session.desiredEndTime
      ? await ctx.scheduler.runAt(parkEnd, internal.renewal.markLapsed, {
          sessionId,
          scheduledForParkEnd: parkEnd,
        })
      : undefined;

  return { duePushId, lapsePushId };
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
