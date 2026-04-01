import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const BUFFER_MS = 10 * 60 * 1000; // 10 min safety buffer before parkend
const EXPIRY_WARNING_MS = 15 * 60 * 1000; // 15 min before desired end

export const tick = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    // Guard: don't process terminal states
    if (["cancelled", "completed"].includes(session.status)) return;

    // If already past desired end and we have coverage, complete
    if (session.lastParkEnd && session.lastParkEnd >= session.desiredEndTime) {
      await ctx.db.patch(args.sessionId, { status: "completed" });
      await ctx.db.insert("renewalLogs", {
        sessionId: args.sessionId,
        action: "completed",
      });
      // Notify user
      await ctx.scheduler.runAfter(0, internal.notifications.sendSessionEnded, {
        sessionId: args.sessionId,
      });
      return;
    }

    // Mark as renewing
    await ctx.db.patch(args.sessionId, { status: "renewing" });

    // Schedule the ParkEaz action
    await ctx.scheduler.runAfter(0, internal.parkeaz.renewalAction, {
      sessionId: args.sessionId,
      cookieJson: session.parkeazCookieJson,
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
    cookieJson: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    // Don't update cancelled sessions
    if (session.status === "cancelled") return;

    // Log renewal
    await ctx.db.insert("renewalLogs", {
      sessionId: args.sessionId,
      action: "renewal",
      parkId: args.parkId,
      parkStart: args.parkStart,
      parkEnd: args.parkEnd,
    });

    // Check if parking now covers desired end time
    if (args.parkEnd >= session.desiredEndTime) {
      await ctx.db.patch(args.sessionId, {
        status: "completed",
        currentParkId: args.parkId,
        lastParkStart: args.parkStart,
        lastParkEnd: args.parkEnd,
        parkeazCookieJson: args.cookieJson,
        retryCount: 0,
        lastError: undefined,
        scheduledFunctionId: undefined,
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
      parkeazCookieJson: args.cookieJson,
      retryCount: 0,
      lastError: undefined,
      expiryWarningId,
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

    if (session.status === "cancelled") return;

    const newRetryCount = session.retryCount + 1;

    await ctx.db.insert("renewalLogs", {
      sessionId: args.sessionId,
      action: "failure",
      error: args.error,
    });

    if (newRetryCount <= 3) {
      // Retry with same cookie, exponential backoff
      const delay = Math.pow(2, newRetryCount) * 5000;
      await ctx.db.patch(args.sessionId, {
        retryCount: newRetryCount,
        lastError: args.error,
        status: "renewing",
      });
      await ctx.scheduler.runAfter(delay, internal.renewal.tick, {
        sessionId: args.sessionId,
      });
    } else if (newRetryCount === 4) {
      // Fresh cookie attempt
      await ctx.db.patch(args.sessionId, {
        retryCount: newRetryCount,
        parkeazCookieJson: undefined,
        lastError: args.error,
        status: "renewing",
      });
      await ctx.scheduler.runAfter(5000, internal.renewal.tick, {
        sessionId: args.sessionId,
      });
    } else {
      // All retries exhausted — mark failed
      await ctx.db.patch(args.sessionId, {
        status: "failed",
        retryCount: newRetryCount,
        lastError: args.error,
        scheduledFunctionId: undefined,
      });

      // Determine urgency
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
