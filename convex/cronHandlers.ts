import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
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

async function hasClientRegistration(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
): Promise<boolean> {
  const logs = ctx.db
    .query("renewalLogs")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId));
  for await (const log of logs) {
    if (log.source === "client") return true;
  }
  return false;
}

// (e) Registrations recorded by the old server scraper (parkId "unknown",
// or no client-recorded registration) may never have reached ParkEaz. Treat
// them as lapsed now and send the lapse push once; lastParkEnd = now keeps
// later sweeps from matching again.
async function lapseLegacyRegistration(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  now: number,
): Promise<void> {
  if (session.lastParkEnd === undefined || session.lastParkEnd <= now) return;
  const isLegacy =
    session.currentParkId === "unknown" ||
    !(await hasClientRegistration(ctx, session._id));
  if (!isLegacy) return;
  await cancelScheduled(ctx, session.duePushId);
  await cancelScheduled(ctx, session.lapsePushId);
  await ctx.db.patch(session._id, {
    lastParkEnd: now,
    lapsedAt: now,
    duePushId: undefined,
    lapsePushId: undefined,
  });
  await ctx.scheduler.runAfter(0, internal.notifications.sendLapsePush, {
    sessionId: session._id,
  });
}

async function sweepActive(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  now: number,
): Promise<void> {
  await clearLegacyTick(ctx, session);
  if (session.desiredEndTime <= now) {
    await completeOverdue(ctx, session);
    return;
  }
  if (session.desiredEndTime === Number.MAX_SAFE_INTEGER) {
    await migrateExtended(ctx, session, now);
  } else {
    await scheduleMissingCompletion(ctx, session);
  }
  await lapseLegacyRegistration(ctx, session, now);
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
    for (const session of active) await sweepActive(ctx, session, now);
  },
});
