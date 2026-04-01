import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const BUFFER_MS = 10 * 60 * 1000; // 10 min safety buffer before parkend
const EXPIRY_WARNING_MS = 15 * 60 * 1000; // 15 min before desired end

const TERMINAL_STATES = ["cancelled", "completed", "failed"];

async function cancelScheduled(
  ctx: { scheduler: { cancel: (id: any) => Promise<void> } },
  id: any,
) {
  if (!id) return;
  try {
    await ctx.scheduler.cancel(id);
  } catch {
    // Already fired or cancelled
  }
}

export const tick = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    if (TERMINAL_STATES.includes(session.status)) return;

    // If already past desired end and we have coverage, complete
    if (session.lastParkEnd && session.lastParkEnd >= session.desiredEndTime) {
      await cancelScheduled(ctx, session.expiryWarningId);
      await ctx.db.patch(args.sessionId, {
        status: "completed",
        expiryWarningId: undefined,
      });
      await ctx.db.insert("renewalLogs", {
        sessionId: args.sessionId,
        action: "completed",
      });
      await ctx.scheduler.runAfter(0, internal.notifications.sendSessionEnded, {
        sessionId: args.sessionId,
      });
      return;
    }

    // Mark as renewing with timestamp
    await ctx.db.patch(args.sessionId, {
      status: "renewing",
      renewingAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.parkeaz.renewalAction, {
      sessionId: args.sessionId,
      plate: session.plate,
      firstName: session.firstName,
      lastName: session.lastName,
      email: session.email,
      mobile: session.mobile,
    });
  },
});

export const saveResult = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    parkId: v.string(),
    parkStart: v.number(),
    parkEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    // Guard against all terminal states
    if (TERMINAL_STATES.includes(session.status)) return;

    await ctx.db.insert("renewalLogs", {
      sessionId: args.sessionId,
      action: "renewal",
      parkId: args.parkId,
      parkStart: args.parkStart,
      parkEnd: args.parkEnd,
    });

    // Check if parking now covers desired end time
    if (args.parkEnd >= session.desiredEndTime) {
      await cancelScheduled(ctx, session.expiryWarningId);
      await ctx.db.patch(args.sessionId, {
        status: "completed",
        currentParkId: args.parkId,
        lastParkStart: args.parkStart,
        lastParkEnd: args.parkEnd,
        retryCount: 0,
        lastError: undefined,
        scheduledFunctionId: undefined,
        expiryWarningId: undefined,
        renewingAt: undefined,
      });
      await ctx.db.insert("renewalLogs", {
        sessionId: args.sessionId,
        action: "completed",
      });
      await ctx.scheduler.runAfter(0, internal.notifications.sendSessionEnded, {
        sessionId: args.sessionId,
      });
      return;
    }

    // Cancel previous scheduled tick if any
    await cancelScheduled(ctx, session.scheduledFunctionId);

    // Schedule next renewal: 10 min before parkEnd
    const nextRenewalAt = args.parkEnd - BUFFER_MS;
    const delay = Math.max(0, nextRenewalAt - Date.now());

    const scheduledFunctionId = await ctx.scheduler.runAfter(
      delay,
      internal.renewal.tick,
      { sessionId: args.sessionId },
    );

    // Schedule expiry warning if not already done and within range
    let expiryWarningId = session.expiryWarningId;
    if (!expiryWarningId) {
      const warningTime = session.desiredEndTime - EXPIRY_WARNING_MS;
      if (warningTime > Date.now()) {
        expiryWarningId = await ctx.scheduler.runAt(
          warningTime,
          internal.notifications.sendExpiryWarning,
          { sessionId: args.sessionId },
        );
      }
    }

    await ctx.db.patch(args.sessionId, {
      status: "active",
      currentParkId: args.parkId,
      lastParkStart: args.parkStart,
      lastParkEnd: args.parkEnd,
      nextRenewalAt,
      scheduledFunctionId,
      retryCount: 0,
      lastError: undefined,
      expiryWarningId,
      renewingAt: undefined,
    });
  },
});

export const handleFailure = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    if (TERMINAL_STATES.includes(session.status)) return;

    const newRetryCount = session.retryCount + 1;

    await ctx.db.insert("renewalLogs", {
      sessionId: args.sessionId,
      action: "failure",
      error: args.error,
    });

    // Cancel any existing scheduled retry before scheduling a new one
    await cancelScheduled(ctx, session.scheduledFunctionId);

    if (newRetryCount <= 4) {
      // Retry with exponential backoff (fresh cookies each time)
      const delay = Math.pow(2, newRetryCount) * 5000;
      const scheduledFunctionId = await ctx.scheduler.runAfter(
        delay,
        internal.renewal.tick,
        { sessionId: args.sessionId },
      );
      await ctx.db.patch(args.sessionId, {
        retryCount: newRetryCount,
        lastError: args.error,
        status: "renewing",
        scheduledFunctionId,
      });
    } else {
      await ctx.db.patch(args.sessionId, {
        status: "failed",
        retryCount: newRetryCount,
        lastError: args.error,
        scheduledFunctionId: undefined,
        renewingAt: undefined,
      });

      const timeToExpiry = session.lastParkEnd
        ? session.lastParkEnd - Date.now()
        : Infinity;

      if (timeToExpiry < EXPIRY_WARNING_MS) {
        await ctx.scheduler.runAfter(
          0,
          internal.notifications.sendUrgentFailure,
          { sessionId: args.sessionId },
        );
      } else {
        await ctx.scheduler.runAfter(
          0,
          internal.notifications.sendRenewalFailure,
          { sessionId: args.sessionId },
        );
      }
    }
  },
});
