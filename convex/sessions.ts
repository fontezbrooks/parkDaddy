import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

export const getActive = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return null;

    const activeStatuses = ["active", "renewing", "failed"];
    for (const status of activeStatuses) {
      const session = await ctx.db
        .query("sessions")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", user._id).eq("status", status),
        )
        .first();
      if (session) {
        const logs = await ctx.db
          .query("renewalLogs")
          .withIndex("by_session", (q) => q.eq("sessionId", session._id))
          .collect();
        return { ...session, renewalLogs: logs };
      }
    }

    return null;
  },
});

export const getLastParked = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return null;

    const completed = await ctx.db
      .query("sessions")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "completed"),
      )
      .collect();

    const cancelled = await ctx.db
      .query("sessions")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "cancelled"),
      )
      .collect();

    const all = [...completed, ...cancelled].sort(
      (a, b) => b._creationTime - a._creationTime,
    );
    const latest = all[0];
    if (!latest) return null;

    return {
      plate: latest.plate,
      endedAt: latest.lastParkEnd ?? latest._creationTime,
    };
  },
});

export const listHistory = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return [];

    const completed = await ctx.db
      .query("sessions")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "completed"),
      )
      .collect();

    const cancelled = await ctx.db
      .query("sessions")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "cancelled"),
      )
      .collect();

    const failed = await ctx.db
      .query("sessions")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "failed"),
      )
      .collect();

    return [...completed, ...cancelled, ...failed].sort(
      (a, b) => b._creationTime - a._creationTime,
    );
  },
});

export const getDetail = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user || session.userId !== user._id) return null;

    const logs = await ctx.db
      .query("renewalLogs")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect();

    return { ...session, renewalLogs: logs };
  },
});

const DAILY_DURATION_MS = 24 * 60 * 60 * 1000;
const EXPIRY_WARNING_MS = 15 * 60 * 1000;
const WEEKLY_CHECK_IN_MS = 7 * 24 * 60 * 60 * 1000;

export const create = mutation({
  args: {
    plate: v.string(),
    makeModel: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("Profile not found. Complete setup first.");

    const plateRegex = /^[A-Z0-9]{1,8}[-\s]?[A-Z0-9]{0,5}$/;
    if (!plateRegex.test(args.plate.toUpperCase().trim())) {
      throw new Error("Invalid license plate format");
    }

    // Check for existing active session
    for (const status of ["active", "renewing", "failed"]) {
      const existing = await ctx.db
        .query("sessions")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", user._id).eq("status", status),
        )
        .first();
      if (existing) {
        throw new Error("An active parking session already exists.");
      }
    }

    // Upsert vehicle
    const plate = args.plate.toUpperCase();
    const existingVehicle = (
      await ctx.db
        .query("vehicles")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect()
    ).find((v) => v.plate === plate);

    let vehicleId;
    if (existingVehicle) {
      await ctx.db.patch(existingVehicle._id, { lastUsedAt: Date.now() });
      vehicleId = existingVehicle._id;
    } else {
      vehicleId = await ctx.db.insert("vehicles", {
        userId: user._id,
        plate,
        makeModel: args.makeModel,
        color: args.color,
        lastUsedAt: Date.now(),
      });
    }

    const mode = user.mode ?? "daily";
    const now = Date.now();
    // Extended Stay uses MAX_SAFE_INTEGER so the renewal cron's
    // `lastParkEnd >= desiredEndTime` short-circuit never fires.
    const desiredEndTime =
      mode === "extended" ? Number.MAX_SAFE_INTEGER : now + DAILY_DURATION_MS;

    const sessionId = await ctx.db.insert("sessions", {
      userId: user._id,
      vehicleId,
      plate,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      mobile: user.mobile,
      desiredEndTime,
      status: "active",
      retryCount: 0,
      mode,
    });

    // Log initial action
    await ctx.db.insert("renewalLogs", {
      sessionId,
      action: "initial",
    });

    // Trigger first renewal immediately
    await ctx.scheduler.runAfter(0, internal.renewal.tick, { sessionId });

    if (mode === "daily") {
      const warningTime = desiredEndTime - EXPIRY_WARNING_MS;
      const expiryWarningId = await ctx.scheduler.runAt(
        warningTime,
        internal.notifications.sendExpiryWarning,
        { sessionId },
      );
      await ctx.db.patch(sessionId, { expiryWarningId });
    } else {
      const weeklyCheckInId = await ctx.scheduler.runAt(
        now + WEEKLY_CHECK_IN_MS,
        internal.notifications.sendWeeklyCheckIn,
        { sessionId },
      );
      await ctx.db.patch(sessionId, { weeklyCheckInId });
    }

    return sessionId;
  },
});

export const extend = mutation({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user || session.userId !== user._id) {
      throw new Error("Not authorized");
    }

    if (!["active", "renewing", "failed"].includes(session.status)) {
      throw new Error("Session is not active");
    }

    // Extended Stay sessions don't expose Extend — no boundary to push.
    if ((session.mode ?? "daily") === "extended") {
      throw new Error("Extended Stay sessions auto-renew; nothing to extend.");
    }

    const newDesiredEndTime = session.desiredEndTime + DAILY_DURATION_MS;

    // Cancel existing expiry warning if scheduled
    if (session.expiryWarningId) {
      try {
        await ctx.scheduler.cancel(session.expiryWarningId);
      } catch {
        // Already fired or cancelled
      }
    }

    // Schedule new expiry warning 15 min before new end
    const warningTime = newDesiredEndTime - EXPIRY_WARNING_MS;
    let expiryWarningId;
    if (warningTime > Date.now()) {
      expiryWarningId = await ctx.scheduler.runAt(
        warningTime,
        internal.notifications.sendExpiryWarning,
        { sessionId: args.sessionId },
      );
    }

    // Reset retryCount so an extend-from-failed gets a fresh retry chain
    // rather than instantly re-failing once and giving up.
    await ctx.db.patch(args.sessionId, {
      desiredEndTime: newDesiredEndTime,
      expiryWarningId,
      retryCount: 0,
      lastError: undefined,
    });

    // Trigger an immediate parkeaz top-up matching the initial-register path.
    // Per FR-5: tapping Extend should refresh coverage now, not wait for the
    // next scheduled tick. renewal.tick handles the active/renewing/failed
    // status transitions and the actual parkeaz call.
    await ctx.scheduler.runAfter(0, internal.renewal.tick, {
      sessionId: args.sessionId,
    });
  },
});

export const cancel = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user || session.userId !== user._id) {
      throw new Error("Not authorized");
    }

    // Cancel scheduled renewal
    if (session.scheduledFunctionId) {
      try {
        await ctx.scheduler.cancel(session.scheduledFunctionId);
      } catch {
        // Already fired
      }
    }

    // Cancel expiry warning
    if (session.expiryWarningId) {
      try {
        await ctx.scheduler.cancel(session.expiryWarningId);
      } catch {
        // Already fired
      }
    }

    // Cancel weekly check-in (Extended Stay sessions only)
    if (session.weeklyCheckInId) {
      try {
        await ctx.scheduler.cancel(session.weeklyCheckInId);
      } catch {
        // Already fired
      }
    }

    await ctx.db.patch(args.sessionId, {
      status: "cancelled",
      scheduledFunctionId: undefined,
      expiryWarningId: undefined,
      weeklyCheckInId: undefined,
    });

    await ctx.db.insert("renewalLogs", {
      sessionId: args.sessionId,
      action: "cancelled",
    });
  },
});

export const retry = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user || session.userId !== user._id) {
      throw new Error("Not authorized");
    }

    if (session.status !== "failed") {
      throw new Error("Session is not in failed state");
    }

    await ctx.db.patch(args.sessionId, {
      status: "active",
      retryCount: 0,
      lastError: undefined,
    });

    await ctx.scheduler.runAfter(0, internal.renewal.tick, {
      sessionId: args.sessionId,
    });
  },
});
