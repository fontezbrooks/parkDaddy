import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

export const getTokensForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});
