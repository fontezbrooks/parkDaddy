import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// Internal query helper to get push tokens for a user

export const sendExpiryWarning = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;
    if (!["active", "renewing"].includes(session.status)) return;

    const user = await ctx.db.get(session.userId);
    if (!user?.notifyOnExpiry) return;

    await ctx.scheduler.runAfter(0, internal.notifications.push, {
      userId: session.userId,
      title: "Parking expires in 15 min",
      body: `Extend parking for ${session.plate}?`,
      data: { route: "/extend-duration", sessionId: args.sessionId },
      categoryIdentifier: "extend_24h",
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

// Extended Stay safety net: weekly "still parked?" check-in.
// Always reschedules the next link even if the user has opted out of expiry
// notifications, so the chain survives a pref change and continues to catch
// forgotten long-term sessions.
const WEEKLY_CHECK_IN_MS = 7 * 24 * 60 * 60 * 1000;

export const sendWeeklyCheckIn = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;
    if (!["active", "renewing"].includes(session.status)) return;

    const user = await ctx.db.get(session.userId);
    if (user?.notifyOnExpiry) {
      await ctx.scheduler.runAfter(0, internal.notifications.push, {
        userId: session.userId,
        title: "Still parked?",
        body: `Confirm you're still using parkDaddy for ${session.plate}.`,
        data: { route: "/(tabs)", sessionId: args.sessionId },
      });
    }

    const nextId = await ctx.scheduler.runAt(
      Date.now() + WEEKLY_CHECK_IN_MS,
      internal.notifications.sendWeeklyCheckIn,
      { sessionId: args.sessionId },
    );
    await ctx.db.patch(args.sessionId, { weeklyCheckInId: nextId });
  },
});

// Renewal/urgent failures bypass user notification prefs: missing one means
// the guest's car gets booted ($250+). Treat as safety-critical, not opt-in.
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
