"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { CookieJar } from "tough-cookie";
import fetch, { Response } from "node-fetch";

const BASE_URL = "https://paid.parkeaz.com";
const ZONE = "622";
const ZONE_ID = "247";
const PROPERTY_ID = "202";
const PROPERTY_NAME = "Ponce Springs Lofts";
const PRODUCT = "3615";
const PRODUCT_TIME = "120";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

// Common browser headers that ParkEaz may validate
const BROWSER_HEADERS = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "max-age=0",
  "Upgrade-Insecure-Requests": "1",
  "User-Agent": BROWSER_UA,
  "sec-ch-ua": '"Not-A.Brand";v="24", "Chromium";v="146"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-User": "?1",
};

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

function applyCookies(jar: CookieJar, url: string, res: Response): void {
  const setCookies = res.headers.raw()["set-cookie"] || [];
  for (const cookie of setCookies) {
    jar.setCookieSync(cookie, url);
  }
}

export const renewalAction = internalAction({
  args: {
    sessionId: v.id("sessions"),
    plate: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    mobile: v.string(),
  },
  handler: async (ctx, args) => {
    const guestCode = process.env.PARKEAZ_GUEST_CODE;
    if (!guestCode) throw new Error("PARKEAZ_GUEST_CODE env var is not set");

    try {
      const jar = new CookieJar();

      // Step 0: Load the actual parking form page (not just homepage).
      // This is what the QR code links to. It initializes the PHP session
      // with zone/property context and starts the 5-minute purchase timer.
      const formUrl = `${BASE_URL}/paid?zone=${ZONE}&propertyid=${PROPERTY_ID}`;
      const formRes = await fetch(formUrl, {
        headers: {
          ...BROWSER_HEADERS,
          "Sec-Fetch-Site": "none",
        },
        redirect: "follow",
      });
      applyCookies(jar, BASE_URL, formRes);
      const formHtml = await formRes.text();

      console.log(`[ParkEaz] Step 0 form page: HTTP ${formRes.status}`, {
        url: formUrl,
        cookies: getCookieHeader(jar, BASE_URL),
        bodyLength: formHtml.length,
        hasForm: formHtml.includes("<form"),
      });

      const parkstart = formatParkDate(new Date());
      const parkEnd = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const parkend = formatParkDate(parkEnd);

      // Step 1: POST /checkout — submit the parking registration form
      const checkoutBody = new URLSearchParams();
      // Blank fields first (replicating captured browser pattern)
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
      // Real values (duplicated keys match captured browser behavior)
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
          ...BROWSER_HEADERS,
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: getCookieHeader(jar, BASE_URL),
          Origin: "null",
        },
        body: checkoutBody.toString(),
        redirect: "follow",
      });
      applyCookies(jar, BASE_URL, checkoutRes);
      const checkoutHtml = await checkoutRes.text();

      console.log(`[ParkEaz] Step 1 /checkout: HTTP ${checkoutRes.status}`, {
        plate: args.plate,
        parkstart,
        finalUrl: checkoutRes.url,
        bodyLength: checkoutHtml.length,
        bodyPreview: checkoutHtml.slice(0, 500),
      });

      if (checkoutRes.status >= 400) {
        throw new Error(
          `Checkout failed: HTTP ${checkoutRes.status} — ${checkoutHtml.slice(0, 200)}`,
        );
      }

      // Step 2: POST /charge — confirm the transaction
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
      chargeBody.append("parkallowtextalert", "On");
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
          ...BROWSER_HEADERS,
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: getCookieHeader(jar, BASE_URL),
          Origin: "null",
        },
        body: chargeBody.toString(),
        redirect: "follow",
      });
      applyCookies(jar, BASE_URL, chargeRes);
      const chargeHtml = await chargeRes.text();

      console.log(`[ParkEaz] Step 2 /charge: HTTP ${chargeRes.status}`, {
        finalUrl: chargeRes.url,
        bodyLength: chargeHtml.length,
      });

      // Check for error redirect (followed automatically now)
      if (chargeRes.url.includes("ErrorMessage")) {
        const errorMatch = chargeRes.url.match(/ErrorMessage=([^&]+)/);
        const errorMsg = errorMatch
          ? decodeURIComponent(errorMatch[1])
          : "Unknown charge error";
        console.error(`[ParkEaz] Charge error redirect:`, errorMsg);
        console.error(
          `[ParkEaz] Charge page body (first 1000):`,
          chargeHtml.slice(0, 1000),
        );
        throw new Error(`ParkEaz charge error: ${errorMsg}`);
      }

      // Extract parkid from response
      let parkId = "unknown";
      const parkIdFromUrl = chargeRes.url.match(/parkid=(\d+)/);
      if (parkIdFromUrl) {
        parkId = parkIdFromUrl[1];
      } else {
        const parkIdFromHtml = chargeHtml.match(/parkid[=:]?\s*["']?(\d+)/i);
        if (parkIdFromHtml) {
          parkId = parkIdFromHtml[1];
        }
      }

      console.log(`[ParkEaz] Step 2 extracted parkId: ${parkId}`);
      console.log(
        `[ParkEaz] Step 2 charge response (first 1000):`,
        chargeHtml.slice(0, 1000),
      );

      // Extract server-confirmed parkend
      let confirmedParkEnd = parkEnd.getTime();
      const parkEndMatch = chargeHtml.match(
        /parkend[=:]\s*["']?([\d-]+[\s+][\d:]+)/i,
      );
      if (parkEndMatch) {
        const parsed = parseParkDate(parkEndMatch[1]);
        if (!isNaN(parsed)) {
          confirmedParkEnd = parsed;
          console.log(
            `[ParkEaz] Extracted parkEnd from charge: ${parkEndMatch[1]} -> ${new Date(parsed).toISOString()}`,
          );
        }
      }

      // Step 3: GET /successful_transaction — confirmation
      const successUrl = `${BASE_URL}/successful_transaction?parkid=${parkId}&zone=${ZONE}&remember=0`;
      const successRes = await fetch(successUrl, {
        headers: {
          ...BROWSER_HEADERS,
          Cookie: getCookieHeader(jar, BASE_URL),
        },
        redirect: "follow",
      });
      applyCookies(jar, BASE_URL, successRes);
      const successHtml = await successRes.text();

      console.log(
        `[ParkEaz] Step 3 /successful_transaction: HTTP ${successRes.status}`,
        {
          parkId,
          finalUrl: successRes.url,
        },
      );
      console.log(
        `[ParkEaz] Step 3 response (first 1000):`,
        successHtml.slice(0, 1000),
      );

      // Extract confirmed end time from success page
      const endTimeMatch = successHtml.match(
        /(?:ends?|expir|valid\s+until)[^"]*?([\d-]+[\s+][\d:]+)/i,
      );
      if (endTimeMatch) {
        const parsed = parseParkDate(endTimeMatch[1]);
        if (!isNaN(parsed) && parsed > Date.now()) {
          confirmedParkEnd = parsed;
          console.log(
            `[ParkEaz] Extracted parkEnd from success: ${endTimeMatch[1]} -> ${new Date(parsed).toISOString()}`,
          );
        }
      }

      const parkStartMs = Date.now();

      console.log(`[ParkEaz] SUCCESS for plate ${args.plate}`, {
        parkId,
        parkStart: new Date(parkStartMs).toISOString(),
        parkEnd: new Date(confirmedParkEnd).toISOString(),
      });

      await ctx.runMutation(internal.renewal.saveResult, {
        sessionId: args.sessionId,
        parkId,
        parkStart: parkStartMs,
        parkEnd: confirmedParkEnd,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown ParkEaz error";
      console.error(`[ParkEaz] FAILED for plate ${args.plate}: ${message}`);
      await ctx.runMutation(internal.renewal.handleFailure, {
        sessionId: args.sessionId,
        error: message,
      });
    }
  },
});
