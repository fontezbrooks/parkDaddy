import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// Internal query helper to get push tokens for a user
const getUserTokens = async (
  ctx: { runQuery: (ref: any, args: any) => Promise<any> },
  userId: string
) => {
  return await ctx.runQuery(internal.notificationsHelpers.getTokensForUser, {
    userId,
  });
};

export const sendExpiryWarning = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;
    if (!["active", "renewing"].includes(session.status)) return;

    await ctx.scheduler.runAfter(0, internal.notifications.push, {
      userId: session.userId,
      title: "Parking expires in 15 min",
      body: `Extend parking for ${session.plate}?`,
      data: { route: "/extend-duration", sessionId: args.sessionId },
    });
  },
});

export const sendSessionEnded = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    await ctx.scheduler.runAfter(0, internal.notifications.push, {
      userId: session.userId,
      title: "Guest parking has ended",
      body: `Parking session for ${session.plate} is complete.`,
      data: { route: "/(tabs)", sessionId: args.sessionId },
    });
  },
});

export const sendRenewalFailure = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    await ctx.scheduler.runAfter(0, internal.notifications.push, {
      userId: session.userId,
      title: "Parking renewal failed",
      body: `Renewal failed for ${session.plate}. Open app to retry.`,
      data: { route: "/(tabs)", sessionId: args.sessionId },
    });
  },
});

export const sendUrgentFailure = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    const minutesLeft = session.lastParkEnd
      ? Math.max(0, Math.round((session.lastParkEnd - Date.now()) / 60000))
      : 0;

    await ctx.scheduler.runAfter(0, internal.notifications.push, {
      userId: session.userId,
      title: `URGENT: Parking expires in ${minutesLeft} min!`,
      body: `Renewal failed for ${session.plate} and registration expires soon!`,
      data: { route: "/(tabs)", sessionId: args.sessionId },
    });
  },
});

export const push = internalAction({
  args: {
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const tokens: Array<{ token: string }> = await ctx.runQuery(
      internal.notificationsHelpers.getTokensForUser,
      { userId: args.userId }
    );

    if (tokens.length === 0) return;

    // Use Expo Push API directly
    const messages = tokens.map((t) => ({
      to: t.token,
      title: args.title,
      body: args.body,
      data: args.data,
      sound: "default" as const,
      priority: "high" as const,
    }));

    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      });
    } catch (error) {
      console.error("Push notification failed:", error);
    }
  },
});
