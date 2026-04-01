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
