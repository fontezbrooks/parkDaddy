import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { normalizePlate } from "../src/domain/renewal";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return [];

    const vehicles = await ctx.db
      .query("vehicles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    return vehicles.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  },
});

export const add = mutation({
  args: {
    plate: v.string(),
    makeModel: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("Profile not found");

    const plate = normalizePlate(args.plate);
    if (!plate) throw new Error("Invalid license plate format");

    const existing = (
      await ctx.db
        .query("vehicles")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect()
    ).find((vehicle) => normalizePlate(vehicle.plate) === plate);

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastUsedAt: Date.now(),
        makeModel: args.makeModel ?? existing.makeModel,
        color: args.color ?? existing.color,
      });
      return existing._id;
    }

    return await ctx.db.insert("vehicles", {
      userId: user._id,
      plate,
      makeModel: args.makeModel,
      color: args.color,
      lastUsedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { vehicleId: v.id("vehicles") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const vehicle = await ctx.db.get(args.vehicleId);
    if (!vehicle) return;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user || vehicle.userId !== user._id) {
      throw new Error("Not authorized");
    }

    await ctx.db.delete(args.vehicleId);
  },
});
