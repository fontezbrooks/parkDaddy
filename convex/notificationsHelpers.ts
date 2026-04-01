import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const getTokensForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const pruneDeadTokens = internalMutation({
  args: { userId: v.id("users"), tokens: v.array(v.string()) },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const entry of all) {
      if (args.tokens.includes(entry.token)) {
        await ctx.db.delete(entry._id);
      }
    }
  },
});
