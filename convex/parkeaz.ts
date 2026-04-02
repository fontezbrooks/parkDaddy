"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { CookieJar } from "tough-cookie";
import fetch from "node-fetch";
import type { Response } from "node-fetch";

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
  // ParkEaz expects Eastern Time. Convex runs in UTC, so we convert.
  const eastern = new Date(
    date.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  const y = eastern.getFullYear();
  const m = String(eastern.getMonth() + 1).padStart(2, "0");
  const d = String(eastern.getDate()).padStart(2, "0");
  const h = String(eastern.getHours()).padStart(2, "0");
  const min = String(eastern.getMinutes()).padStart(2, "0");
  const s = String(eastern.getSeconds()).padStart(2, "0");
  // Use a space separator, NOT "+". URLSearchParams encodes space as "+" in
  // form data, which PHP decodes back to space. A literal "+" would be encoded
  // as "%2B", which PHP interprets as a timezone offset — breaking the date.
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
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
    console.log(
      `[ParkEaz] renewalAction started for plate=${args.plate}, session=${args.sessionId}`,
    );

    const guestCode = process.env.PARKEAZ_GUEST_CODE;
    if (!guestCode) throw new Error("PARKEAZ_GUEST_CODE env var is not set");

    // ParkEaz expects digits only for mobile (e.g. "4044372480")
    const mobileDigits = args.mobile.replace(/\D/g, "");

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
      checkoutBody.append("mobile", mobileDigits);
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
      checkoutBody.append("parkallowtextalert", "On");

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
      });

      if (checkoutRes.status >= 400) {
        throw new Error(
          `Checkout failed: HTTP ${checkoutRes.status} — ${checkoutHtml.slice(0, 200)}`,
        );
      }

      // Parse the checkout response to extract the form that submits to /charge.
      // The browser renders this page and the user clicks "Confirm" which submits
      // the form. We need to extract all hidden inputs and the form action.
      const formActionMatch = checkoutHtml.match(
        /<form[^>]*action=["']([^"']+)["'][^>]*>/i,
      );
      const chargeUrl = formActionMatch
        ? new URL(formActionMatch[1], BASE_URL).href
        : `${BASE_URL}/charge`;

      // Extract all <input> fields (hidden and otherwise) from the form
      const inputRegex =
        /<input[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["'][^>]*>/gi;
      const formFields: Record<string, string> = {};
      let match;
      while ((match = inputRegex.exec(checkoutHtml)) !== null) {
        formFields[match[1]] = match[2];
      }
      // Also try value-before-name pattern
      const inputRegex2 =
        /<input[^>]*value=["']([^"']*)["'][^>]*name=["']([^"']+)["'][^>]*>/gi;
      while ((match = inputRegex2.exec(checkoutHtml)) !== null) {
        if (!(match[2] in formFields)) {
          formFields[match[2]] = match[1];
        }
      }

      console.log(`[ParkEaz] Step 1 form action: ${chargeUrl}`);
      console.log(
        `[ParkEaz] Step 1 extracted form fields:`,
        JSON.stringify(formFields),
      );

      // Override fields that may have wrong values from the form
      formFields["parkallowtextalert"] = "On";
      formFields["mobile"] = mobileDigits;

      // Build charge body from extracted form fields
      const chargeBody = new URLSearchParams();
      for (const [key, value] of Object.entries(formFields)) {
        chargeBody.append(key, value);
      }

      console.log(
        `[ParkEaz] Step 2 /charge request body:`,
        chargeBody.toString(),
      );

      const chargeRes = await fetch(chargeUrl, {
        method: "POST",
        headers: {
          ...BROWSER_HEADERS,
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: getCookieHeader(jar, BASE_URL),
          Origin: BASE_URL,
          Referer: `${BASE_URL}/checkout`,
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
