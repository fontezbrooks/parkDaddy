import { ConvexError } from "convex/values";
import type { CoverageEndSource } from "@/src/domain/renewal";
import { formatEasternClock } from "@/src/domain/easternTime";
import {
  PARKEAZ_ORIGIN,
  SUCCESS_PROBE_SCRIPT,
  buildInjection,
  detectPage,
  parseErrorMessage,
  parsePageParkEnd,
  parseParkId,
  type AutofillResult,
  type AutofillValues,
  type ParkEazPage,
} from "./pages";

type Registration = {
  parkId: string;
  parkStart: number;
  parkEnd: number;
  parkEndSource: CoverageEndSource;
};

export type RenewFlowState =
  | { step: "loading" }
  | {
      step: "page";
      page: ParkEazPage;
      autofill: "pending" | AutofillResult;
      // Coverage end the checkout page advertised; a fallback for the save.
      expectedEnd?: number;
    }
  | { step: "parkeaz_error"; message: string }
  | { step: "load_error" }
  | ({ step: "saving" } & Registration)
  | ({ step: "save_failed" } & Registration)
  | { step: "done" };

export type RenewFlowEvent =
  | { type: "navigated"; url: string }
  | { type: "autofill"; page: ParkEazPage; result: AutofillResult }
  | { type: "checkout_info"; durationMs: number; now: number }
  | { type: "success_page"; url: string; text: string; now: number }
  | { type: "load_error" }
  | { type: "save_ok" }
  | { type: "save_failed" }
  | { type: "retry" };

const MISSING_PARK_ID_MESSAGE =
  "ParkEaz didn't show a confirmation number. Check your email before trying again.";

// Once ParkEaz has confirmed a registration, page events must not discard it.
function isRegistered(state: RenewFlowState): boolean {
  return (
    state.step === "saving" ||
    state.step === "save_failed" ||
    state.step === "done"
  );
}

function onNavigated(state: RenewFlowState, url: string): RenewFlowState {
  // load_error is sticky: onLoadEnd also fires after a failed load.
  if (isRegistered(state) || state.step === "load_error") return state;
  const message = parseErrorMessage(url);
  if (message) return { step: "parkeaz_error", message };
  return { step: "page", page: detectPage(url), autofill: "pending" };
}

function onAutofill(
  state: RenewFlowState,
  page: ParkEazPage,
  result: AutofillResult,
): RenewFlowState {
  if (state.step !== "page" || state.page !== page) return state;
  // Once the script has pressed Register nothing on the page can undo it.
  if (state.autofill === "submitted") return state;
  return { ...state, autofill: result };
}

function onCheckoutInfo(
  state: RenewFlowState,
  event: { durationMs: number; now: number },
): RenewFlowState {
  if (state.step !== "page" || state.page !== "checkout") return state;
  return { ...state, expectedEnd: event.now + event.durationMs };
}

function onSuccessPage(
  state: RenewFlowState,
  event: { url: string; text: string; now: number },
): RenewFlowState {
  if (isRegistered(state)) return state;
  const parkId = parseParkId(event.url);
  if (!parkId)
    return { step: "parkeaz_error", message: MISSING_PARK_ID_MESSAGE };
  const expectedEnd =
    state.step === "page" && state.page === "checkout"
      ? state.expectedEnd
      : undefined;
  const { parkEnd, source } = parsePageParkEnd(
    event.text,
    event.now,
    expectedEnd,
  );
  return {
    step: "saving",
    parkId,
    parkStart: event.now,
    parkEnd,
    parkEndSource: source,
  };
}

function onRetry(state: RenewFlowState): RenewFlowState {
  if (state.step === "save_failed") return { ...state, step: "saving" };
  if (state.step === "load_error" || state.step === "parkeaz_error") {
    return { step: "loading" };
  }
  return state;
}

export function renewFlowReducer(
  state: RenewFlowState,
  event: RenewFlowEvent,
): RenewFlowState {
  switch (event.type) {
    case "navigated":
      return onNavigated(state, event.url);
    case "autofill":
      return onAutofill(state, event.page, event.result);
    case "checkout_info":
      return onCheckoutInfo(state, event);
    case "success_page":
      return onSuccessPage(state, event);
    case "load_error":
      return isRegistered(state) ? state : { step: "load_error" };
    case "save_ok":
      return state.step === "saving" ? { step: "done" } : state;
    case "save_failed":
      return state.step === "saving"
        ? { ...state, step: "save_failed" }
        : state;
    case "retry":
      return onRetry(state);
  }
}

const CHECKOUT_BANNERS: Record<"pending" | AutofillResult, string> = {
  pending: "Waiting for the human check…",
  waiting: "Waiting for the human check…",
  applied: "Waiting for the human check…",
  submitted: "Registering…",
  timeout: "Tap Register To Park",
  skipped: "ParkEaz changed their page. Fill it in by hand.",
};

function checkoutBannerText(
  state: Extract<RenewFlowState, { step: "page" }>,
): string {
  const base = CHECKOUT_BANNERS[state.autofill];
  if (state.expectedEnd === undefined) return base;
  return `${base} · Covers until ${formatEasternClock(state.expectedEnd)}`;
}

function pageBannerText(
  state: Extract<RenewFlowState, { step: "page" }>,
): string {
  if (state.page === "checkout") return checkoutBannerText(state);
  if (state.autofill === "skipped") {
    return "ParkEaz changed their page. Fill it in by hand.";
  }
  if (state.page === "paid" || state.page === "select_product") {
    return "Filling in your details…";
  }
  if (state.page === "success") return "Confirming…";
  return "Follow the steps on the page.";
}

export function bannerText(state: RenewFlowState): string {
  switch (state.step) {
    case "loading":
      return "Loading ParkEaz…";
    case "page":
      return pageBannerText(state);
    case "parkeaz_error":
      return state.message;
    case "load_error":
      return "Couldn't reach ParkEaz. Tap Retry.";
    case "saving":
      return "Saving…";
    case "save_failed":
      return `Registered with ParkEaz but we couldn't save it. Confirmation ${state.parkId}.`;
    case "done":
      return "Registered.";
  }
}

export function parseRenewParams(
  params: Record<string, unknown>,
): string | null {
  const { sessionId } = params;
  return typeof sessionId === "string" && sessionId.length > 0
    ? sessionId
    : null;
}

export function isParkEazOrigin(url: string): boolean {
  return originOf(url) === PARKEAZ_ORIGIN;
}

// The only gate between user data and a page: nothing runs off ParkEaz's
// origin, and a page carrying ErrorMessage is never auto-submitted again.
export function injectionFor(
  url: string,
  values: AutofillValues,
): string | null {
  if (!isParkEazOrigin(url) || parseErrorMessage(url)) return null;
  const page = detectPage(url);
  if (page === "success") return SUCCESS_PROBE_SCRIPT;
  return buildInjection(page, values);
}

const PAGES: readonly string[] = [
  "paid",
  "select_product",
  "checkout",
  "success",
  "other",
];

function isPage(value: unknown): value is ParkEazPage {
  return typeof value === "string" && PAGES.includes(value);
}

const AUTOFILL_RESULTS: readonly string[] = [
  "applied",
  "skipped",
  "waiting",
  "submitted",
  "timeout",
];

function isAutofillResult(value: unknown): value is AutofillResult {
  return typeof value === "string" && AUTOFILL_RESULTS.includes(value);
}

function isPositiveDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function parseJsonObject(data: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(data);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function parseWebViewMessage(
  data: string,
  now: number,
): RenewFlowEvent | null {
  const msg = parseJsonObject(data);
  if (!msg) return null;
  if (msg.type === "autofill" && isPage(msg.page)) {
    if (!isAutofillResult(msg.result)) return null;
    return { type: "autofill", page: msg.page, result: msg.result };
  }
  if (msg.type === "checkout_info") {
    if (!isPositiveDuration(msg.durationMs)) return null;
    return { type: "checkout_info", durationMs: msg.durationMs, now };
  }
  if (msg.type === "success_page") {
    if (typeof msg.url !== "string" || typeof msg.text !== "string") {
      return null;
    }
    return { type: "success_page", url: msg.url, text: msg.text, now };
  }
  return null;
}

const FATAL_SAVE_CODES: readonly string[] = [
  "not_authorized",
  "session_not_active",
  "invalid_registration",
];

// Retrying these cannot succeed. Matches the code, never the message text,
// because production Convex redacts plain error messages.
export function isFatalSaveError(error: unknown): boolean {
  if (!(error instanceof ConvexError)) return false;
  const data: unknown = error.data;
  if (typeof data !== "object" || data === null) return false;
  const { code } = data as { code?: unknown };
  return typeof code === "string" && FATAL_SAVE_CODES.includes(code);
}

const SERVER_ERROR_STATUS = 500;

// A 5xx from ParkEaz leaves a dead page; 4xx pages are ParkEaz's own UI.
export function httpErrorEvent(statusCode: number): RenewFlowEvent | null {
  return statusCode >= SERVER_ERROR_STATUS ? { type: "load_error" } : null;
}

export type RenewResult = "success" | "parkeaz_error" | "load_error";

export type CheckoutSubmit = "auto" | "timeout" | "skipped";

// Which checkout outcomes are worth a breadcrumb, and under what name.
export function checkoutSubmitFor(result: AutofillResult): CheckoutSubmit | null {
  if (result === "submitted") return "auto";
  if (result === "timeout" || result === "skipped") return result;
  return null;
}

export function breadcrumbResultFor(
  step: RenewFlowState["step"],
): RenewResult | null {
  if (step === "done") return "success";
  if (step === "parkeaz_error" || step === "load_error") return step;
  return null;
}

// Top-frame navigation stays on ParkEaz and its human-check providers
// (Cloudflare Turnstile today; the reCAPTCHA hosts stay until a live capture
// shows they are gone); sub-frames are free.
const TOP_FRAME_ORIGINS: readonly string[] = [
  PARKEAZ_ORIGIN,
  "https://challenges.cloudflare.com",
  "https://www.google.com",
  "https://www.gstatic.com",
  "https://recaptcha.net",
  "https://www.recaptcha.net",
];

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// react-native-webview 13.15 reports isTopFrame: true for every Android
// request, iframes included, so the top-frame rule would send reCAPTCHA
// iframe redirects to the system browser. Android allows all loads.
export function shouldLoadRequest(
  request: { url: string; isTopFrame?: boolean },
  platform: "ios" | "android",
): "allow" | "open_external" {
  if (platform === "android") return "allow";
  if (request.isTopFrame !== true) return "allow";
  if (request.url.startsWith("about:")) return "allow";
  const origin = originOf(request.url);
  return origin !== null && TOP_FRAME_ORIGINS.includes(origin)
    ? "allow"
    : "open_external";
}
