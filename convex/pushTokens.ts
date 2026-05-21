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

    if (existing.some((t) => t.token === args.token)) return;

    // Keep one token per platform: drop other tokens on this platform,
    // preserve tokens on different platforms so iPhone + iPad can coexist.
    for (const old of existing) {
      if (old.platform === args.platform) {
        await ctx.db.delete(old._id);
      }
    }

    await ctx.db.insert("pushTokens", {
      userId: user._id,
      token: args.token,
      platform: args.platform,
    });
  },
});
