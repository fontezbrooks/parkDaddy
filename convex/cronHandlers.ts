import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

export const safetyNetScan = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find active sessions with overdue renewals
    const overdue = await ctx.db
      .query("sessions")
      .withIndex("by_next_renewal", (q) =>
        q.eq("status", "active").lt("nextRenewalAt", now),
      )
      .collect();

    for (const session of overdue) {
      // Only re-trigger if the renewal is significantly overdue (5+ min)
      if (
        session.nextRenewalAt &&
        now - session.nextRenewalAt > 5 * 60 * 1000
      ) {
        console.log(
          `Safety net: re-triggering renewal for session ${session._id}`,
        );
        await ctx.scheduler.runAfter(0, internal.renewal.tick, {
          sessionId: session._id,
        });
      }
    }

    // Also check renewing sessions stuck for >5 min
    const stuck = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "renewing"))
      .collect();

    for (const session of stuck) {
      // If a session has been "renewing" for more than 5 minutes, re-trigger
      const stuckDuration = now - session._creationTime;
      if (
        stuckDuration > 5 * 60 * 1000 &&
        session.nextRenewalAt &&
        now - session.nextRenewalAt > 5 * 60 * 1000
      ) {
        console.log(`Safety net: unsticking renewing session ${session._id}`);
        await ctx.db.patch(session._id, { status: "active" });
        await ctx.scheduler.runAfter(0, internal.renewal.tick, {
          sessionId: session._id,
        });
      }
    }
  },
});
