import {
  MAX_COVERAGE_MS,
  PARK_END_SLACK_MS,
  modelCoverageEnd,
  type CoverageEndSource,
} from "@/src/domain/renewal";
import { easternWallClockToMs } from "@/src/domain/easternTime";

export const PARKEAZ_ORIGIN = "https://paid.parkeaz.com";
export const PARKEAZ_START_URL =
  PARKEAZ_ORIGIN + "/paid?zone=622&propertyid=202";
export const ZONE = "622";

// A page time is trusted only inside (now, now + MAX_COVERAGE_MS + slack].
const PARK_END_PATTERN =
  /\b(?:valid until|ends|expires|parkend)\b\D{0,40}?(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/i;
// Checkout advertises the product length as "Time: 9 hours 44 minutes".
const CHECKOUT_DURATION_PATTERN =
  /\bTime:\s*(?:(\d+)\s*hours?)?\s*(?:(\d+)\s*minutes?)?/i;

export type AutofillResult =
  | "applied"
  | "skipped"
  | "waiting"
  | "submitted"
  | "timeout";

export type ParkEazPage =
  | "paid"
  | "select_product"
  | "checkout"
  | "success"
  | "other";

export type AutofillValues = {
  plate: string;
  mobile: string;
  email: string;
  firstName: string;
  lastName: string;
  guestCode: string;
};

export function detectPage(url: string): ParkEazPage {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "other";
  }
  const path = parsed.pathname.replace(/\/+$/, "");
  if (path === "/successful_transaction" || parsed.searchParams.has("parkid"))
    return "success";
  if (path === "/paid") return "paid";
  if (path === "/select_product") return "select_product";
  if (path === "/checkout") return "checkout";
  return "other";
}

// Shared prelude: helpers + required-element check. Plain ES5 on purpose.
const SCRIPT_PRELUDE = `
  var CFG = __CONFIG__;
  var V = CFG.values;
  function postRaw(obj) {
    window.ReactNativeWebView.postMessage(JSON.stringify(obj));
  }
  function post(result) {
    postRaw({ type: "autofill", page: CFG.page, result: result });
  }
  function byId(id) { return document.getElementById(id); }
  function fire(el, type) {
    var ev = document.createEvent("Event");
    ev.initEvent(type, true, true);
    el.dispatchEvent(ev);
  }
  function setValue(id, value) {
    var el = byId(id);
    el.value = value;
    fire(el, "input");
    fire(el, "change");
  }
  function hasAll(ids) {
    for (var i = 0; i < ids.length; i++) { if (!byId(ids[i])) return false; }
    return true;
  }
`;

const PAID_BODY = `
  if (!hasAll(["zone", "plate", "parktermsagreed", "selecttime"])) { post("skipped"); return; }
  setValue("zone", CFG.zone);
  setValue("plate", V.plate);
  var terms = byId("parktermsagreed");
  terms.checked = true;
  fire(terms, "change");
  post("applied");
  byId("selecttime").click();
`;

// Never submits without a guest code: the user fills it in by hand instead.
const SELECT_PRODUCT_BODY = `
  if (!hasAll(["mobile", "email", "firstname", "lastname", "guestcode"]) || !byId("guestcode").form) {
    post("skipped");
    return;
  }
  setValue("mobile", V.mobile);
  setValue("email", V.email);
  setValue("firstname", V.firstName);
  setValue("lastname", V.lastName);
  if (!V.guestCode) { post("skipped"); return; }
  setValue("guestcode", V.guestCode);
  post("applied");
  byId("guestcode").form.submit();
`;

// Checkout carries Cloudflare Turnstile. The page's own hidden input fills
// with a token once the challenge passes on this device; we only watch for
// that and then press the site's Register control, once. We never touch the
// widget. Without a token for 90 s the user taps Register by hand.
const CHECKOUT_BODY = `
  if (!V.guestCode) { post("skipped"); return; }
  post("waiting");
  var text = document.body.innerText || document.body.textContent || "";
  var m = ${CHECKOUT_DURATION_PATTERN.toString()}.exec(text);
  if (m && (m[1] || m[2])) {
    var durationMs = ((Number(m[1] || 0) * 60) + Number(m[2] || 0)) * 60000;
    if (durationMs > 0) postRaw({ type: "checkout_info", durationMs: durationMs });
  }
  function findRegister() {
    var els = document.querySelectorAll("button, input[type=submit]");
    for (var i = 0; i < els.length; i++) {
      var label = els[i].textContent || els[i].value || "";
      if (/register to park/i.test(label)) return els[i];
    }
    return null;
  }
  var started = Date.now();
  var timer = setInterval(function () {
    if (window.__parkdaddySubmitted) { clearInterval(timer); return; }
    var elapsed = Date.now() - started;
    var register = findRegister();
    if (!register && elapsed >= 2000) { clearInterval(timer); post("skipped"); return; }
    if (elapsed >= 90000) { clearInterval(timer); post("timeout"); return; }
    var token = document.querySelector('input[name="cf-turnstile-response"]');
    if (!token || !token.value || !register || register.disabled) return;
    window.__parkdaddySubmitted = true;
    clearInterval(timer);
    post("submitted");
    register.click();
  }, 250);
`;

const PAGE_BODIES: Partial<Record<ParkEazPage, string>> = {
  paid: PAID_BODY,
  select_product: SELECT_PRODUCT_BODY,
  checkout: CHECKOUT_BODY,
};

export function buildInjection(
  page: ParkEazPage,
  values: AutofillValues,
): string | null {
  const body = PAGE_BODIES[page];
  if (!body) return null;
  const config = JSON.stringify({ values, page, zone: ZONE });
  const prelude = SCRIPT_PRELUDE.replace("__CONFIG__", () => config);
  return `(function () {${prelude}${body}})(); true;`;
}

export const SUCCESS_PROBE_SCRIPT = `(function () {
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: "success_page",
    url: location.href,
    text: document.body.innerText
  }));
})(); true;`;

export function parseCheckoutDuration(text: string): number | null {
  const m = CHECKOUT_DURATION_PATTERN.exec(text);
  if (!m || (!m[1] && !m[2])) return null;
  const minutes = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  return minutes > 0 ? minutes * 60_000 : null;
}

function isPlausibleEnd(candidate: number | null | undefined, now: number) {
  return (
    typeof candidate === "number" &&
    Number.isFinite(candidate) &&
    now < candidate &&
    candidate <= now + MAX_COVERAGE_MS + PARK_END_SLACK_MS
  );
}

// Coverage end, best source first: the success page's own time, the
// duration the checkout page advertised, then the clock model.
export function parsePageParkEnd(
  text: string,
  now: number,
  expectedEnd?: number | null,
): { parkEnd: number; source: CoverageEndSource } {
  const pageEnd = matchParkEnd(text);
  if (isPlausibleEnd(pageEnd, now)) {
    return { parkEnd: pageEnd as number, source: "page" };
  }
  if (isPlausibleEnd(expectedEnd, now)) {
    return { parkEnd: expectedEnd as number, source: "checkout" };
  }
  return { parkEnd: modelCoverageEnd(now), source: "model" };
}

function matchParkEnd(text: string): number | null {
  const match = PARK_END_PATTERN.exec(text);
  if (!match) return null;
  const [y, mo, d, h, mi, s] = match.slice(1).map(Number);
  const parkEnd = easternWallClockToMs(Date.UTC(y, mo - 1, d, h, mi, s));
  return Number.isFinite(parkEnd) ? parkEnd : null;
}

function getQueryParam(url: string, name: string): string | null {
  try {
    return new URL(url).searchParams.get(name);
  } catch {
    return null;
  }
}

export function parseParkId(url: string): string | null {
  return getQueryParam(url, "parkid");
}

export function parseErrorMessage(url: string): string | null {
  return getQueryParam(url, "ErrorMessage");
}
