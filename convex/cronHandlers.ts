import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { DAILY_DURATION_MS } from "../src/domain/renewal";
import {
  cancelScheduled,
  clearExtendedState,
  scheduleSessionEnd,
} from "./renewal";

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

// Any active session still holding a pending renewal.tick (deleted) drops it.
async function clearLegacyTick(
  ctx: MutationCtx,
  session: Doc<"sessions">,
): Promise<void> {
  if (!session.scheduledFunctionId) return;
  await cancelScheduled(ctx, session.scheduledFunctionId);
  await ctx.db.patch(session._id, { scheduledFunctionId: undefined });
}

// (b) Extended Stay sessions become daily sessions ending 24h from now.
async function migrateExtended(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  now: number,
): Promise<void> {
  const desiredEndTime = now + DAILY_DURATION_MS;
  const legacyPatch = await clearExtendedState(ctx, session, now);
  const endIds = await scheduleSessionEnd(
    ctx,
    session._id,
    desiredEndTime,
    session,
  );
  await ctx.db.patch(session._id, {
    desiredEndTime,
    ...legacyPatch,
    ...endIds,
  });
}

// (c) Sessions already past their end complete now.
async function completeOverdue(
  ctx: MutationCtx,
  session: Doc<"sessions">,
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.renewal.completeAtDesiredEnd, {
    sessionId: session._id,
  });
}

// (d) Legacy daily sessions created before completionId existed get one.
async function scheduleMissingCompletion(
  ctx: MutationCtx,
  session: Doc<"sessions">,
): Promise<void> {
  if (session.completionId) return;
  const completionId = await ctx.scheduler.runAt(
    session.desiredEndTime,
    internal.renewal.completeAtDesiredEnd,
    { sessionId: session._id },
  );
  await ctx.db.patch(session._id, { completionId });
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
      await clearLegacyTick(ctx, session);
      if (session.desiredEndTime === Number.MAX_SAFE_INTEGER) {
        await migrateExtended(ctx, session, now);
      } else if (session.desiredEndTime <= now) {
        await completeOverdue(ctx, session);
      } else {
        await scheduleMissingCompletion(ctx, session);
      }
    }
  },
});
