import {
  renewFlowReducer,
  bannerText,
  parseRenewParams,
  injectionFor,
  parseWebViewMessage,
  isFatalSaveError,
  breadcrumbResultFor,
  shouldLoadRequest,
  httpErrorEvent,
  type RenewFlowState,
} from "../renewFlow";
import { ConvexError } from "convex/values";
import { SUCCESS_PROBE_SCRIPT, type AutofillValues } from "../pages";

const now = 1_800_000_000_000;
const loading: RenewFlowState = { step: "loading" };

test("navigating to /paid enters page state with autofill pending", () => {
  expect(
    renewFlowReducer(loading, {
      type: "navigated",
      url: "https://paid.parkeaz.com/paid?zone=622&propertyid=202",
    }),
  ).toEqual({ step: "page", page: "paid", autofill: "pending" });
});
test("autofill skipped is recorded and banner asks for manual entry", () => {
  const s = renewFlowReducer(
    { step: "page", page: "paid", autofill: "pending" },
    { type: "autofill", page: "paid", result: "skipped" },
  );
  expect(s).toEqual({ step: "page", page: "paid", autofill: "skipped" });
  expect(bannerText(s)).toBe("ParkEaz changed their page. Fill it in by hand.");
});
test("checkout banner tells the user to tap Register To Park", () => {
  expect(
    bannerText({ step: "page", page: "checkout", autofill: "pending" }),
  ).toBe("Tap Register To Park");
});
test("ErrorMessage in URL becomes parkeaz_error with decoded text", () => {
  expect(
    renewFlowReducer(loading, {
      type: "navigated",
      url: "https://paid.parkeaz.com/paid?ErrorMessage=Plate%20already%20registered",
    }),
  ).toEqual({ step: "parkeaz_error", message: "Plate already registered" });
});
test("success page with parkid and parkend enters saving", () => {
  const pageNow = Date.UTC(2026, 9, 31, 23, 0, 0); // 2h07m before 21:07:15 EDT
  const s = renewFlowReducer(
    { step: "page", page: "checkout", autofill: "pending" },
    {
      type: "success_page",
      url: "https://paid.parkeaz.com/successful_transaction?parkid=123456",
      text: "Parking valid until 2026-10-31 21:07:15",
      now: pageNow,
    },
  );
  expect(s).toMatchObject({
    step: "saving",
    parkId: "123456",
    parkStart: pageNow,
    parkEnd: Date.UTC(2026, 10, 1, 1, 7, 15),
    parkEndSource: "page",
  });
});
test("success page without parkend uses fallback", () => {
  const s = renewFlowReducer(loading, {
    type: "success_page",
    url: "https://x/successful_transaction?parkid=7",
    text: "ok",
    now,
  });
  expect(s).toMatchObject({
    step: "saving",
    parkId: "7",
    parkEnd: now + 7_200_000,
    parkEndSource: "fallback",
  });
});
test("save_failed keeps the values and banner shows the confirmation id", () => {
  const saving: RenewFlowState = {
    step: "saving",
    parkId: "123456",
    parkStart: now,
    parkEnd: now + 1,
    parkEndSource: "page",
  };
  const s = renewFlowReducer(saving, { type: "save_failed" });
  expect(s).toEqual({ ...saving, step: "save_failed" });
  expect(bannerText(s)).toBe(
    "Registered with ParkEaz but we couldn't save it. Confirmation 123456.",
  );
  expect(renewFlowReducer(s, { type: "retry" })).toEqual(saving);
});
test("retry from load_error or parkeaz_error returns to loading", () => {
  expect(renewFlowReducer({ step: "load_error" }, { type: "retry" })).toEqual(
    loading,
  );
  expect(
    renewFlowReducer(
      { step: "parkeaz_error", message: "x" },
      { type: "retry" },
    ),
  ).toEqual(loading);
});
test("save_ok is done", () => {
  expect(
    renewFlowReducer(
      {
        step: "saving",
        parkId: "1",
        parkStart: now,
        parkEnd: now,
        parkEndSource: "page",
      },
      { type: "save_ok" },
    ),
  ).toEqual({ step: "done" });
});
test("parseRenewParams rejects missing, empty, and non-string ids", () => {
  expect(parseRenewParams({ sessionId: "abc" })).toBe("abc");
  expect(parseRenewParams({})).toBeNull();
  expect(parseRenewParams({ sessionId: "" })).toBeNull();
  expect(parseRenewParams({ sessionId: ["a", "b"] })).toBeNull();
});

describe("guards", () => {
  const saving: RenewFlowState = {
    step: "saving",
    parkId: "9",
    parkStart: now,
    parkEnd: now + 1,
    parkEndSource: "page",
  };

  test("a success navigation stays in page state until the probe reports", () => {
    expect(
      renewFlowReducer(loading, {
        type: "navigated",
        url: "https://paid.parkeaz.com/successful_transaction?parkid=9",
      }),
    ).toEqual({ step: "page", page: "success", autofill: "pending" });
  });
  test("navigation, load errors, and success probes never discard a registration", () => {
    const url = "https://paid.parkeaz.com/paid";
    for (const s of [saving, { ...saving, step: "save_failed" as const }]) {
      expect(renewFlowReducer(s, { type: "navigated", url })).toBe(s);
      expect(renewFlowReducer(s, { type: "load_error" })).toBe(s);
      expect(
        renewFlowReducer(s, {
          type: "success_page",
          url: "https://x/?parkid=10",
          text: "",
          now,
        }),
      ).toBe(s);
    }
    const done: RenewFlowState = { step: "done" };
    expect(renewFlowReducer(done, { type: "navigated", url })).toBe(done);
  });
  test("load_error is not cleared by the onLoadEnd that follows a failed load", () => {
    const s: RenewFlowState = { step: "load_error" };
    expect(
      renewFlowReducer(s, {
        type: "navigated",
        url: "https://paid.parkeaz.com/paid",
      }),
    ).toBe(s);
  });
  test("autofill for a page the user already left is ignored", () => {
    const s: RenewFlowState = {
      step: "page",
      page: "select_product",
      autofill: "pending",
    };
    expect(
      renewFlowReducer(s, {
        type: "autofill",
        page: "paid",
        result: "applied",
      }),
    ).toBe(s);
  });
  test("success page without a parkid becomes a parkeaz_error", () => {
    const s = renewFlowReducer(loading, {
      type: "success_page",
      url: "https://paid.parkeaz.com/successful_transaction",
      text: "",
      now,
    });
    expect(s.step).toBe("parkeaz_error");
  });
  test("save events outside saving are ignored", () => {
    expect(renewFlowReducer(loading, { type: "save_ok" })).toBe(loading);
    expect(renewFlowReducer(loading, { type: "save_failed" })).toBe(loading);
    expect(renewFlowReducer(loading, { type: "retry" })).toBe(loading);
  });
});

describe("bannerText", () => {
  test.each([
    [{ step: "loading" }, "Loading ParkEaz…"],
    [
      { step: "page", page: "select_product", autofill: "pending" },
      "Filling in your details…",
    ],
    [{ step: "parkeaz_error", message: "Bad plate" }, "Bad plate"],
    [{ step: "load_error" }, "Couldn't reach ParkEaz. Tap Retry."],
    [
      {
        step: "saving",
        parkId: "1",
        parkStart: 0,
        parkEnd: 1,
        parkEndSource: "page",
      },
      "Saving…",
    ],
    [{ step: "done" }, "Registered."],
    [
      { step: "page", page: "other", autofill: "pending" },
      "Follow the steps on the page.",
    ],
    [{ step: "page", page: "success", autofill: "pending" }, "Confirming…"],
  ] as [RenewFlowState, string][])("%o -> %s", (state, text) => {
    expect(bannerText(state)).toBe(text);
  });
});

describe("injectionFor", () => {
  const values: AutofillValues = {
    plate: "ABC123",
    mobile: "5555550100",
    email: "a@b.co",
    firstName: "A",
    lastName: "B",
    guestCode: "CODE1",
  };

  test("autofills ParkEaz form pages", () => {
    const script = injectionFor(
      "https://paid.parkeaz.com/paid?zone=622&propertyid=202",
      values,
    );
    expect(script).toContain("ABC123");
  });
  test("probes the success page", () => {
    expect(
      injectionFor(
        "https://paid.parkeaz.com/successful_transaction?parkid=1",
        values,
      ),
    ).toBe(SUCCESS_PROBE_SCRIPT);
  });
  test.each([
    "https://evil.example/paid",
    "https://evil.example/successful_transaction?parkid=1",
    "http://paid.parkeaz.com/paid",
    "https://www.google.com/recaptcha/api2/anchor",
    "not a url",
  ])("injects nothing off-origin: %s", (url) => {
    expect(injectionFor(url, values)).toBeNull();
  });
  test("does not re-submit a page that carries an ErrorMessage", () => {
    expect(
      injectionFor("https://paid.parkeaz.com/paid?ErrorMessage=Nope", values),
    ).toBeNull();
  });
  test("injects nothing on checkout", () => {
    expect(
      injectionFor("https://paid.parkeaz.com/checkout", values),
    ).toBeNull();
  });
});

describe("parseWebViewMessage", () => {
  test("parses autofill results", () => {
    expect(
      parseWebViewMessage(
        JSON.stringify({ type: "autofill", page: "paid", result: "applied" }),
        now,
      ),
    ).toEqual({ type: "autofill", page: "paid", result: "applied" });
  });
  test("parses success probes and stamps the screen clock", () => {
    expect(
      parseWebViewMessage(
        JSON.stringify({ type: "success_page", url: "u", text: "t" }),
        now,
      ),
    ).toEqual({ type: "success_page", url: "u", text: "t", now });
  });
  test.each([
    "not json",
    "null",
    "42",
    JSON.stringify({ type: "autofill", page: "nope", result: "applied" }),
    JSON.stringify({ type: "autofill", page: "paid", result: "maybe" }),
    JSON.stringify({ type: "success_page", url: 1, text: "t" }),
    JSON.stringify({ type: "save_ok" }),
  ])("rejects malformed message %s", (data) => {
    expect(parseWebViewMessage(data, now)).toBeNull();
  });
});

describe("isFatalSaveError", () => {
  const coded = (code: string) => new ConvexError({ code, message: code });

  test.each(["not_authorized", "session_not_active", "invalid_registration"])(
    "coded %s errors cannot be retried",
    (code) => {
      expect(isFatalSaveError(coded(code))).toBe(true);
    },
  );
  test.each([
    ["an unknown code", coded("rate_limited")],
    ["a ConvexError with string data", new ConvexError("Not authorized")],
    ["a plain Error carrying the old text", new Error("Not authorized")],
    ["a redacted server error", new Error("Server Error")],
    ["a network failure", new Error("Network request failed")],
    ["a string", "boom"],
    ["null", null],
    ["undefined", undefined],
  ])("%s stays retryable", (_label, error) => {
    expect(isFatalSaveError(error)).toBe(false);
  });
});

describe("breadcrumbResultFor", () => {
  test.each([
    ["done", "success"],
    ["parkeaz_error", "parkeaz_error"],
    ["load_error", "load_error"],
  ] as const)("%s reports %s", (step, result) => {
    expect(breadcrumbResultFor(step)).toBe(result);
  });
  test.each(["loading", "page", "saving", "save_failed"] as const)(
    "%s is not a result",
    (step) => {
      expect(breadcrumbResultFor(step)).toBeNull();
    },
  );
});

describe("shouldLoadRequest", () => {
  test.each([
    "https://paid.parkeaz.com/paid?zone=622&propertyid=202",
    "https://paid.parkeaz.com/termsandconditions.pdf",
    "https://www.google.com/recaptcha/api2/anchor",
    "https://www.gstatic.com/recaptcha/releases/x/recaptcha__en.js",
    "https://recaptcha.net/recaptcha/api.js",
    "https://www.recaptcha.net/recaptcha/api.js",
  ])("allows top-frame %s", (url) => {
    expect(shouldLoadRequest({ url, isTopFrame: true }, "ios")).toBe("allow");
  });
  test.each([
    "https://example.com",
    "http://paid.parkeaz.com/paid",
    "https://paid.parkeaz.com.evil.example/paid",
    "not a url",
  ])("opens top-frame %s externally", (url) => {
    expect(shouldLoadRequest({ url, isTopFrame: true }, "ios")).toBe(
      "open_external",
    );
  });
  test("allows sub-frame requests to any origin", () => {
    expect(
      shouldLoadRequest(
        { url: "https://example.com", isTopFrame: false },
        "ios",
      ),
    ).toBe("allow");
  });
  test("allows requests without frame info (Android)", () => {
    expect(shouldLoadRequest({ url: "https://example.com" }, "ios")).toBe(
      "allow",
    );
  });
  test("on Android allows every request, even off-origin top-frame", () => {
    expect(
      shouldLoadRequest(
        { url: "https://example.com", isTopFrame: true },
        "android",
      ),
    ).toBe("allow");
  });
  test("allows about:blank", () => {
    expect(
      shouldLoadRequest({ url: "about:blank", isTopFrame: true }, "ios"),
    ).toBe("allow");
  });
});

describe("httpErrorEvent", () => {
  test.each([500, 502, 503, 599])("%i is a load_error", (status) => {
    expect(httpErrorEvent(status)).toEqual({ type: "load_error" });
  });
  test.each([200, 302, 404, 499])("%i is ignored", (status) => {
    expect(httpErrorEvent(status)).toBeNull();
  });
  test("a 5xx on a ParkEaz page moves the reducer to load_error", () => {
    const page: RenewFlowState = {
      step: "page",
      page: "paid",
      autofill: "pending",
    };
    expect(renewFlowReducer(page, httpErrorEvent(503)!)).toEqual({
      step: "load_error",
    });
  });
  test("a 5xx after ParkEaz confirmed keeps the registration", () => {
    const saving: RenewFlowState = {
      step: "saving",
      parkId: "1",
      parkStart: 0,
      parkEnd: 1,
      parkEndSource: "page",
    };
    expect(renewFlowReducer(saving, httpErrorEvent(500)!)).toBe(saving);
  });
});
