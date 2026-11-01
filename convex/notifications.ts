import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// Internal query helper to get push tokens for a user

export const sendExpiryWarning = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;
    if (session.status !== "active") return;

    const user = await ctx.db.get(session.userId);
    if (!user?.notifyOnExpiry) return;

    await ctx.scheduler.runAfter(0, internal.notifications.push, {
      userId: session.userId,
      title: "Parking expires in 15 min",
      body: `Add 24 more hours for ${session.plate}?`,
      data: { route: "/extend-duration", sessionId: args.sessionId },
    });
  },
});

export const sendSessionEnded = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    const user = await ctx.db.get(session.userId);
    if (!user?.notifyOnSuccess) return;

    await ctx.scheduler.runAfter(0, internal.notifications.push, {
      userId: session.userId,
      title: "Guest parking has ended",
      body: `Parking session for ${session.plate} is complete.`,
      data: { route: "/(tabs)", sessionId: args.sessionId },
    });
  },
});

export const sendDuePush = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "active") return;

    await ctx.scheduler.runAfter(0, internal.notifications.push, {
      userId: session.userId,
      title: `Renew parking for ${session.plate}`,
      body: `Tap to keep ${session.plate} registered. Takes one tap.`,
      data: { route: "/renew", sessionId: args.sessionId },
    });
  },
});

export const sendLapsePush = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "active") return;

    await ctx.scheduler.runAfter(0, internal.notifications.push, {
      userId: session.userId,
      title: `${session.plate} is unregistered`,
      body: "Open parkDaddy to re-register.",
      data: { route: "/renew", sessionId: args.sessionId },
    });
  },
});

export const push = internalAction({
  args: {
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    data: v.optional(
      v.object({ route: v.string(), sessionId: v.id("sessions") }),
    ),
    categoryIdentifier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tokens: { token: string }[] = await ctx.runQuery(
      internal.notificationsHelpers.getTokensForUser,
      { userId: args.userId },
    );

    if (tokens.length === 0) return;

    // Use Expo Push API directly. categoryId triggers the registered
    // notification category on iOS (action buttons); Android ignores it.
    const messages = tokens.map((t) => ({
      to: t.token,
      title: args.title,
      body: args.body,
      data: args.data,
      sound: "default" as const,
      priority: "high" as const,
      ...(args.categoryIdentifier
        ? { categoryId: args.categoryIdentifier }
        : {}),
    }));

    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        const responseText = await response.text().catch(() => "(unreadable)");
        console.error("Expo push API returned non-OK response", {
          status: response.status,
          body: responseText,
        });
        return;
      }

      const body = (await response.json()) as {
        data: Array<{ status: string; details?: { error?: string } }>;
      };
      const deadTokens: string[] = [];
      body.data.forEach((ticket, i) => {
        if (
          ticket.status === "error" &&
          ticket.details?.error === "DeviceNotRegistered"
        ) {
          deadTokens.push(tokens[i].token);
        } else if (ticket.status === "error") {
          console.error("Expo push ticket error", {
            index: i,
            error: ticket.details?.error,
          });
        }
      });
      if (deadTokens.length > 0) {
        await ctx.runMutation(internal.notificationsHelpers.pruneDeadTokens, {
          userId: args.userId,
          tokens: deadTokens,
        });
      }
    } catch (error) {
      console.error("Push notification failed:", error);
    }
  },
});
