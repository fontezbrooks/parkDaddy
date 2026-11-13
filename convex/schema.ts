import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    mobile: v.string(),
    notifyOnExpiry: v.boolean(),
    notifyOnSuccess: v.boolean(),
    mode: v.optional(v.union(v.literal("daily"), v.literal("extended"))),
    // Legacy (3.3.0 pre-release): the guest code now comes from the Convex
    // env via config.getGuestCode. Kept optional so existing docs validate.
    guestCode: v.optional(v.string()),
  }).index("by_clerk_id", ["clerkId"]),

  vehicles: defineTable({
    userId: v.id("users"),
    plate: v.string(),
    makeModel: v.optional(v.string()),
    color: v.optional(v.string()),
    lastUsedAt: v.number(),
  }).index("by_user", ["userId"]),

  sessions: defineTable({
    userId: v.id("users"),
    vehicleId: v.optional(v.id("vehicles")),
    plate: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    mobile: v.string(),
    desiredEndTime: v.number(),
    status: v.string(),
    currentParkId: v.optional(v.string()),
    lastParkStart: v.optional(v.number()),
    lastParkEnd: v.optional(v.number()),
    nextRenewalAt: v.optional(v.number()),
    scheduledFunctionId: v.optional(v.id("_scheduled_functions")),
    expiryWarningId: v.optional(v.id("_scheduled_functions")),
    renewingAt: v.optional(v.number()),
    retryCount: v.number(),
    lastError: v.optional(v.string()),
    mode: v.optional(v.union(v.literal("daily"), v.literal("extended"))),
    weeklyCheckInId: v.optional(v.id("_scheduled_functions")),
    dueAt: v.optional(v.number()),
    lapsedAt: v.optional(v.number()),
    duePushId: v.optional(v.id("_scheduled_functions")),
    lapsePushId: v.optional(v.id("_scheduled_functions")),
    completionId: v.optional(v.id("_scheduled_functions")),
    migratedFromExtendedAt: v.optional(v.number()),
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_status", ["status"])
    .index("by_next_renewal", ["status", "nextRenewalAt"]),

  renewalLogs: defineTable({
    sessionId: v.id("sessions"),
    action: v.string(),
    parkId: v.optional(v.string()),
    parkStart: v.optional(v.number()),
    parkEnd: v.optional(v.number()),
    error: v.optional(v.string()),
    source: v.optional(v.union(v.literal("server"), v.literal("client"))),
    // "fallback" is the pre-3.3.0-release name for "model"; kept for old rows.
    parkEndSource: v.optional(
      v.union(
        v.literal("page"),
        v.literal("checkout"),
        v.literal("model"),
        v.literal("fallback"),
      ),
    ),
  }).index("by_session", ["sessionId"]),

  pushTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    platform: v.string(),
  }).index("by_user", ["userId"]),
});
