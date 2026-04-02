import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const STUCK_THRESHOLD_MS = 5 * 60 * 1000;

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
      if (
        session.nextRenewalAt &&
        now - session.nextRenewalAt > STUCK_THRESHOLD_MS
      ) {
        await ctx.scheduler.runAfter(0, internal.renewal.tick, {
          sessionId: session._id,
        });
      }
    }

    // Check renewing sessions stuck based on renewingAt timestamp
    const stuck = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "renewing"))
      .collect();

    for (const session of stuck) {
      if (!session.renewingAt) continue;
      if (now - session.renewingAt > STUCK_THRESHOLD_MS) {
        await ctx.db.patch(session._id, { status: "active" });
        await ctx.scheduler.runAfter(0, internal.renewal.tick, {
          sessionId: session._id,
        });
      }
    }
  },
});
