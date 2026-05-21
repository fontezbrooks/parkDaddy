import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getProfile = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
  },
});

export const upsertProfile = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    mobile: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        firstName: args.firstName,
        lastName: args.lastName,
        email: args.email,
        mobile: args.mobile,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      mobile: args.mobile,
      notifyOnExpiry: true,
      notifyOnSuccess: false,
    });
  },
});

export const updateNotificationPrefs = mutation({
  args: {
    notifyOnExpiry: v.boolean(),
    notifyOnSuccess: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("Profile not found");

    await ctx.db.patch(user._id, {
      notifyOnExpiry: args.notifyOnExpiry,
      notifyOnSuccess: args.notifyOnSuccess,
    });
  },
});

export const updateMode = mutation({
  args: {
    mode: v.union(v.literal("daily"), v.literal("extended")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("Profile not found");

    for (const status of ["active", "renewing", "failed"]) {
      const existing = await ctx.db
        .query("sessions")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", user._id).eq("status", status),
        )
        .first();
      if (existing) {
        throw new Error(
          "Stop your current parking session before changing modes.",
        );
      }
    }

    await ctx.db.patch(user._id, { mode: args.mode });
  },
});

export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return;

    // Cancel scheduled functions on active sessions
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user_status", (q) => q.eq("userId", user._id))
      .collect();

    for (const session of sessions) {
      if (session.scheduledFunctionId) {
        try {
          await ctx.scheduler.cancel(session.scheduledFunctionId);
        } catch {
          // Already fired or cancelled
        }
      }
      if (session.expiryWarningId) {
        try {
          await ctx.scheduler.cancel(session.expiryWarningId);
        } catch {
          // Already fired or cancelled
        }
      }
      if (session.weeklyCheckInId) {
        try {
          await ctx.scheduler.cancel(session.weeklyCheckInId);
        } catch {
          // Already fired or cancelled
        }
      }

      const logs = await ctx.db
        .query("renewalLogs")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const log of logs) {
        await ctx.db.delete(log._id);
      }

      await ctx.db.delete(session._id);
    }

    const vehicles = await ctx.db
      .query("vehicles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const vehicle of vehicles) {
      await ctx.db.delete(vehicle._id);
    }

    const pushTokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const token of pushTokens) {
      await ctx.db.delete(token._id);
    }

    await ctx.db.delete(user._id);
  },
});
