import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { DAILY_DURATION_MS } from "../src/domain/renewal";
import { cancelScheduled } from "./renewal";

const LEGACY_STATUSES = ["renewing", "failed"];

// (a) Legacy renewing/failed sessions return to "active"; their old
// renewal.tick (now deleted) is cancelled.
async function reactivateLegacy(
  ctx: MutationCtx,
  session: Doc<"sessions">,
): Promise<void> {
  await cancelScheduled(ctx, session.scheduledFunctionId);
  await ctx.db.patch(session._id, {
    status: "active",
    retryCount: 0,
    lastError: undefined,
    renewingAt: undefined,
    scheduledFunctionId: undefined,
  });
}

// (b) Extended Stay sessions become daily sessions ending 24h from now.
async function migrateExtended(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  now: number,
): Promise<void> {
  await cancelScheduled(ctx, session.weeklyCheckInId);
  await cancelScheduled(ctx, session.scheduledFunctionId);
  const desiredEndTime = now + DAILY_DURATION_MS;
  const completionId = await ctx.scheduler.runAt(
    desiredEndTime,
    internal.renewal.completeAtDesiredEnd,
    { sessionId: session._id },
  );
  await ctx.db.patch(session._id, {
    desiredEndTime,
    weeklyCheckInId: undefined,
    scheduledFunctionId: undefined,
    migratedFromExtendedAt: now,
    completionId,
  });
}

// (c) Sessions already past their end complete now.
async function completeOverdue(
  ctx: MutationCtx,
  session: Doc<"sessions">,
): Promise<void> {
  await cancelScheduled(ctx, session.scheduledFunctionId);
  await ctx.scheduler.runAfter(0, internal.renewal.completeAtDesiredEnd, {
    sessionId: session._id,
  });
}

export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    for (const status of LEGACY_STATUSES) {
      const legacy = await ctx.db
        .query("sessions")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      for (const session of legacy) await reactivateLegacy(ctx, session);
    }

    const active = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    for (const session of active) {
      if (session.desiredEndTime === Number.MAX_SAFE_INTEGER) {
        await migrateExtended(ctx, session, now);
      } else if (session.desiredEndTime <= now) {
        await completeOverdue(ctx, session);
      }
    }
  },
});
