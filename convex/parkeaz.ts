"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { CookieJar } from "tough-cookie";
import fetch from "node-fetch";

const BASE_URL = "https://paid.parkeaz.com";
const ZONE = "622";
const ZONE_ID = "247";
const PROPERTY_ID = "202";
const PROPERTY_NAME = "Ponce Springs Lofts";
const PRODUCT = "3615";
const PRODUCT_TIME = "120";

function formatParkDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d}+${h}:${min}:${s}`;
}

function parseParkDate(dateStr: string): number {
  const cleaned = dateStr.replace("+", " ").trim();
  return new Date(cleaned).getTime();
}

function getCookieHeader(jar: CookieJar, url: string): string {
  return jar.getCookieStringSync(url);
}

function applyCookies(
  jar: CookieJar,
  url: string,
  headers: Record<string, string[]>,
): void {
  const setCookies = headers["set-cookie"] || [];
  for (const cookie of setCookies) {
    jar.setCookieSync(cookie, url);
  }
}

export const renewalAction = internalAction({
  args: {
    sessionId: v.id("sessions"),
    cookieJson: v.optional(v.string()),
    plate: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    mobile: v.string(),
  },
  handler: async (ctx, args) => {
    const guestCode = process.env.PARKEAZ_GUEST_CODE ?? "MTDJR7";

    try {
      // Restore or create cookie jar
      let jar: CookieJar;
      if (args.cookieJson) {
        jar = CookieJar.fromJSON(JSON.parse(args.cookieJson)) as CookieJar;
      } else {
        jar = new CookieJar();
        // Obtain fresh PHPSESSID
        const initRes = await fetch(`${BASE_URL}/`, {
          headers: { Cookie: "" },
          redirect: "manual",
        });
        const initHeaders = initRes.headers.raw();
        applyCookies(jar, BASE_URL, initHeaders);
      }

      const parkstart = formatParkDate(new Date());
      const parkEnd = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const parkend = formatParkDate(parkEnd);

      // Step 1: POST /checkout
      const checkoutBody = new URLSearchParams();
      // Blank fields first (replicating captured pattern)
      checkoutBody.append("tenant", "");
      checkoutBody.append("spacenumber", "");
      checkoutBody.append("mobile", "");
      checkoutBody.append("email", "");
      checkoutBody.append("firstname", "");
      checkoutBody.append("lastname", "");
      checkoutBody.append("vehiclemake", "");
      checkoutBody.append("vehiclemodel", "");
      checkoutBody.append("vehiclecolor", "");
      checkoutBody.append("vehiclestate", "");
      checkoutBody.append("couponcode", "");
      checkoutBody.append("guestcode", "");
      checkoutBody.append("postalcode", "");
      // Real values
      checkoutBody.append("product", PRODUCT);
      checkoutBody.append("guestcode", guestCode);
      checkoutBody.append("couponcode", "");
      checkoutBody.append("mobile", args.mobile);
      checkoutBody.append("email", args.email);
      checkoutBody.append("firstname", args.firstName);
      checkoutBody.append("lastname", args.lastName);
      checkoutBody.append("vehiclemake", "");
      checkoutBody.append("vehiclemodel", "");
      checkoutBody.append("vehiclecolor", "");
      checkoutBody.append("zone", ZONE);
      checkoutBody.append("zoneid", ZONE_ID);
      checkoutBody.append("propertyid", PROPERTY_ID);
      checkoutBody.append("plate", args.plate);
      checkoutBody.append("parkstart", parkstart);
      checkoutBody.append("extension", "0");

      const checkoutRes = await fetch(`${BASE_URL}/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: getCookieHeader(jar, BASE_URL),
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        },
        body: checkoutBody.toString(),
        redirect: "manual",
      });
      applyCookies(jar, BASE_URL, checkoutRes.headers.raw());

      if (checkoutRes.status >= 400) {
        throw new Error(`Checkout failed: HTTP ${checkoutRes.status}`);
      }

      // Step 2: POST /charge
      const chargeBody = new URLSearchParams();
      chargeBody.append("parkstart", parkstart);
      chargeBody.append("parkend", parkend);
      chargeBody.append("zone", ZONE);
      chargeBody.append("zoneid", ZONE_ID);
      chargeBody.append("propertyid", PROPERTY_ID);
      chargeBody.append("propertyname", PROPERTY_NAME);
      chargeBody.append("plate", args.plate);
      chargeBody.append("tenantid", "");
      chargeBody.append("email", args.email);
      chargeBody.append("mobile", args.mobile);
      chargeBody.append("parkallowtextalert", "Off");
      chargeBody.append("spacenumber", "");
      chargeBody.append("firstname", args.firstName);
      chargeBody.append("lastname", args.lastName);
      chargeBody.append("vehiclemake", "");
      chargeBody.append("vehiclemodel", "");
      chargeBody.append("vehiclecolor", "");
      chargeBody.append("vehiclestate", "");
      chargeBody.append("product", PRODUCT);
      chargeBody.append("producttime", PRODUCT_TIME);
      chargeBody.append("couponid", "0");
      chargeBody.append("coupondiscount", "0");
      chargeBody.append("couponpriceadded", "0");
      chargeBody.append("productprice", "0.00");
      chargeBody.append("transactionfee", "0");
      chargeBody.append("totalcharge", "0");
      chargeBody.append("stripeprice", "0");
      chargeBody.append("extension", "0");
      chargeBody.append("guestcode", guestCode);

      const chargeRes = await fetch(`${BASE_URL}/charge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: getCookieHeader(jar, BASE_URL),
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        },
        body: chargeBody.toString(),
        redirect: "manual",
      });
      applyCookies(jar, BASE_URL, chargeRes.headers.raw());

      if (chargeRes.status >= 400) {
        throw new Error(`Charge failed: HTTP ${chargeRes.status}`);
      }

      // Try to extract parkid from charge response
      const chargeHtml = await chargeRes.text();
      let parkId = "unknown";

      // Look for parkid in redirect URL or HTML content
      const redirectLocation = chargeRes.headers.get("location") || "";
      const parkIdFromRedirect = redirectLocation.match(/parkid=(\d+)/);
      if (parkIdFromRedirect) {
        parkId = parkIdFromRedirect[1];
      } else {
        // Try HTML body
        const parkIdFromHtml = chargeHtml.match(/parkid[=:]?\s*["']?(\d+)/i);
        if (parkIdFromHtml) {
          parkId = parkIdFromHtml[1];
        }
      }

      // Extract server-confirmed parkend if available
      let confirmedParkEnd = parkEnd.getTime();
      const parkEndMatch = chargeHtml.match(
        /parkend[=:]\s*["']?([\d-]+[\s+][\d:]+)/i,
      );
      if (parkEndMatch) {
        const parsed = parseParkDate(parkEndMatch[1]);
        if (!isNaN(parsed)) confirmedParkEnd = parsed;
      }

      // Step 3: GET /successful_transaction
      const successUrl = `${BASE_URL}/successful_transaction?parkid=${parkId}&zone=${ZONE}&remember=0`;
      const successRes = await fetch(successUrl, {
        headers: {
          Cookie: getCookieHeader(jar, BASE_URL),
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        },
        redirect: "manual",
      });
      applyCookies(jar, BASE_URL, successRes.headers.raw());

      // Try to extract confirmed end time from success page
      const successHtml = await successRes.text();
      const endTimeMatch = successHtml.match(
        /(?:ends?|expir|valid\s+until)[^"]*?([\d-]+[\s+][\d:]+)/i,
      );
      if (endTimeMatch) {
        const parsed = parseParkDate(endTimeMatch[1]);
        if (!isNaN(parsed) && parsed > Date.now()) confirmedParkEnd = parsed;
      }

      const cookieJson = JSON.stringify(jar.toJSON());
      const parkStartMs = Date.now();

      await ctx.runMutation(internal.renewal.saveResult, {
        sessionId: args.sessionId,
        parkId,
        parkStart: parkStartMs,
        parkEnd: confirmedParkEnd,
        cookieJson,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown ParkEaz error";
      await ctx.runMutation(internal.renewal.handleFailure, {
        sessionId: args.sessionId,
        error: message,
      });
    }
  },
});
