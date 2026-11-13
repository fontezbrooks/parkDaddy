import { query } from "./_generated/server";
import { normalizeGuestCode } from "../src/domain/renewal";

/**
 * The property-wide ParkEaz guest code. Lives only in the Convex environment
 * (`PARKEAZ_GUEST_CODE`) so a rotation is `npx convex env set` with no app
 * release. Returns null when unset or malformed; the client shows an
 * "unavailable" state in that case and never submits the ParkEaz form.
 */
export const getGuestCode = query({
  args: {},
  handler: async (ctx): Promise<string | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const raw = process.env.PARKEAZ_GUEST_CODE ?? "";
    return normalizeGuestCode(raw);
  },
});
