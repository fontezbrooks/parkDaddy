import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const save = mutation({
  args: {
    token: v.string(),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("Profile not found");

    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const match = existing.find((t) => t.token === args.token);
    if (match) return;

    // Remove old tokens for this user, keep only latest
    for (const old of existing) {
      await ctx.db.delete(old._id);
    }

    await ctx.db.insert("pushTokens", {
      userId: user._id,
      token: args.token,
      platform: args.platform,
    });
  },
});
