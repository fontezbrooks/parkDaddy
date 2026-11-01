import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  computeDueAt,
  DAILY_DURATION_MS,
  EXPIRY_WARNING_MS,
  isDuplicateRegistration,
  normalizePlate,
} from "../src/domain/renewal";
import { cancelScheduled, scheduleRegistrationPushes } from "./renewal";

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

    const activeStatuses = ["active"];
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

const LIVE_STATUSES = ["active", "renewing", "failed"];
const PLATE_PATTERN = /^[A-Z0-9]{1,8}[-\s]?[A-Z0-9]{0,5}$/;

async function requireUser(ctx: MutationCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user) throw new Error("Profile not found. Complete setup first.");
  return user;
}

async function requireOwnedSession(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
): Promise<{ user: Doc<"users">; session: Doc<"sessions"> }> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");

  const session = await ctx.db.get(sessionId);
  if (!session) throw new Error("Session not found");

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user || session.userId !== user._id) {
    throw new Error("Not authorized");
  }
  return { user, session };
}

async function hasLiveSession(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  for (const status of LIVE_STATUSES) {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", status),
      )
      .first();
    if (existing) return true;
  }
  return false;
}

async function upsertVehicle(
  ctx: MutationCtx,
  userId: Id<"users">,
  plate: string,
  details: { makeModel?: string; color?: string },
): Promise<Id<"vehicles">> {
  const vehicles = await ctx.db
    .query("vehicles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const existing = vehicles.find((vehicle) => vehicle.plate === plate);
  if (existing) {
    await ctx.db.patch(existing._id, { lastUsedAt: Date.now() });
    return existing._id;
  }
  return await ctx.db.insert("vehicles", {
    userId,
    plate,
    makeModel: details.makeModel,
    color: details.color,
    lastUsedAt: Date.now(),
  });
}

export const create = mutation({
  args: {
    plate: v.string(),
    makeModel: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    if (!PLATE_PATTERN.test(args.plate.toUpperCase().trim())) {
      throw new Error("Invalid license plate format");
    }
    if (await hasLiveSession(ctx, user._id)) {
      throw new Error("An active parking session already exists.");
    }

    const plate = normalizePlate(args.plate);
    const vehicleId = await upsertVehicle(ctx, user._id, plate, args);
    const desiredEndTime = Date.now() + DAILY_DURATION_MS;

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
    });
    await ctx.db.insert("renewalLogs", { sessionId, action: "initial" });

    const expiryWarningId = await ctx.scheduler.runAt(
      desiredEndTime - EXPIRY_WARNING_MS,
      internal.notifications.sendExpiryWarning,
      { sessionId },
    );
    const completionId = await ctx.scheduler.runAt(
      desiredEndTime,
      internal.renewal.completeAtDesiredEnd,
      { sessionId },
    );
    await ctx.db.patch(sessionId, { expiryWarningId, completionId });

    return sessionId;
  },
});

export const recordRegistration = mutation({
  args: {
    sessionId: v.id("sessions"),
    parkId: v.string(),
    parkStart: v.number(),
    parkEnd: v.number(),
    parkEndSource: v.union(v.literal("page"), v.literal("fallback")),
  },
  handler: async (ctx, args) => {
    const { session } = await requireOwnedSession(ctx, args.sessionId);
    if (session.status !== "active") throw new Error("Session is not active");
    if (!args.parkId.trim() || args.parkEnd <= args.parkStart) {
      throw new Error("Invalid registration");
    }
    if (isDuplicateRegistration(session, args.parkId)) return;

    await ctx.db.insert("renewalLogs", {
      sessionId: args.sessionId,
      action: "registered",
      parkId: args.parkId,
      parkStart: args.parkStart,
      parkEnd: args.parkEnd,
      source: "client",
      parkEndSource: args.parkEndSource,
    });

    const ids = await scheduleRegistrationPushes(ctx, session, args.parkEnd);
    await ctx.db.patch(args.sessionId, {
      currentParkId: args.parkId,
      lastParkStart: args.parkStart,
      lastParkEnd: args.parkEnd,
      dueAt: computeDueAt(args.parkEnd),
      lapsedAt: undefined,
      nextRenewalAt: undefined,
      ...ids,
    });
  },
});

export const extend = mutation({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    const { session } = await requireOwnedSession(ctx, args.sessionId);
    if (!LIVE_STATUSES.includes(session.status)) {
      throw new Error("Session is not active");
    }

    const newDesiredEndTime = session.desiredEndTime + DAILY_DURATION_MS;

    await cancelScheduled(ctx, session.expiryWarningId);
    const warningTime = newDesiredEndTime - EXPIRY_WARNING_MS;
    const expiryWarningId =
      warningTime > Date.now()
        ? await ctx.scheduler.runAt(
            warningTime,
            internal.notifications.sendExpiryWarning,
            { sessionId: args.sessionId },
          )
        : undefined;

    await cancelScheduled(ctx, session.completionId);
    const completionId = await ctx.scheduler.runAt(
      newDesiredEndTime,
      internal.renewal.completeAtDesiredEnd,
      { sessionId: args.sessionId },
    );

    await ctx.db.patch(args.sessionId, {
      desiredEndTime: newDesiredEndTime,
      expiryWarningId,
      completionId,
    });
  },
});

export const cancel = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const { session } = await requireOwnedSession(ctx, args.sessionId);

    await cancelScheduled(ctx, session.scheduledFunctionId);
    await cancelScheduled(ctx, session.expiryWarningId);
    await cancelScheduled(ctx, session.weeklyCheckInId);
    await cancelScheduled(ctx, session.duePushId);
    await cancelScheduled(ctx, session.lapsePushId);
    await cancelScheduled(ctx, session.completionId);

    await ctx.db.patch(args.sessionId, {
      status: "cancelled",
      scheduledFunctionId: undefined,
      expiryWarningId: undefined,
      weeklyCheckInId: undefined,
      duePushId: undefined,
      lapsePushId: undefined,
      completionId: undefined,
    });

    await ctx.db.insert("renewalLogs", {
      sessionId: args.sessionId,
      action: "cancelled",
    });
  },
});
