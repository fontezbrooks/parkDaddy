import { PARK_END_SLACK_MS, REGISTRATION_MS } from "@/src/domain/renewal";
import { easternWallClockToMs } from "@/src/domain/easternTime";

export const PARKEAZ_ORIGIN = "https://paid.parkeaz.com";
export const PARKEAZ_START_URL =
  PARKEAZ_ORIGIN + "/paid?zone=622&propertyid=202";
export const ZONE = "622";

// A page time is trusted only inside (now, now + 2h + slack].
const PARK_END_PATTERN =
  /\b(?:valid until|ends|expires|parkend)\b\D{0,40}?(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/i;

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
  function post(result) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "autofill", page: CFG.page, result: result }));
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

const PAGE_BODIES: Partial<Record<ParkEazPage, string>> = {
  paid: PAID_BODY,
  select_product: SELECT_PRODUCT_BODY,
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

export function parsePageParkEnd(
  text: string,
  now: number,
): { parkEnd: number; source: "page" | "fallback" } {
  const parkEnd = matchParkEnd(text);
  const isPlausible =
    parkEnd !== null &&
    now < parkEnd &&
    parkEnd <= now + REGISTRATION_MS + PARK_END_SLACK_MS;
  if (isPlausible) return { parkEnd, source: "page" };
  return { parkEnd: now + REGISTRATION_MS, source: "fallback" };
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
