/**
 * @jest-environment jsdom
 */
// src/parkeaz/__tests__/pages.test.ts
import { readFileSync } from "fs";
import { join } from "path";
import {
  detectPage,
  buildInjection,
  parsePageParkEnd,
  parseCheckoutDuration,
  parseParkId,
  parseErrorMessage,
  PARKEAZ_START_URL,
} from "../pages";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "..", "__fixtures__", name), "utf8");
const values = {
  plate: "PRBE0001",
  mobile: "4045550199",
  email: "p@example.com",
  firstName: "Probe",
  lastName: "Test",
  guestCode: "ABCD12",
};

function runInjection(
  html: string,
  page: "paid" | "select_product" | "checkout",
  setup?: () => void,
  injected = values,
) {
  document.documentElement.innerHTML = html;
  delete (window as any).__parkdaddySubmitted; // a real page load resets it
  const posted: unknown[] = [];
  (window as any).ReactNativeWebView = {
    postMessage: (m: string) => posted.push(JSON.parse(m)),
  };
  for (const f of Array.from(document.forms)) f.submit = jest.fn();
  setup?.();
  new Function(buildInjection(page, injected)!)();
  return posted;
}

describe("detectPage", () => {
  test.each([
    [PARKEAZ_START_URL, "paid"],
    ["https://paid.parkeaz.com/select_product", "select_product"],
    ["https://paid.parkeaz.com/checkout", "checkout"],
    [
      "https://paid.parkeaz.com/successful_transaction?parkid=1&zone=622",
      "success",
    ],
    ["https://paid.parkeaz.com/charge?parkid=99", "success"],
    ["https://paid.parkeaz.com/coupon", "other"],
  ])("%s -> %s", (url, page) => expect(detectPage(url)).toBe(page));
});

describe("buildInjection on /paid", () => {
  test("fills zone, plate, terms, clicks Select Time, posts applied", () => {
    let termsAtClick: boolean | null = null;
    const posted = runInjection(fixture("paid.html"), "paid", () => {
      document.getElementById("selecttime")!.addEventListener(
        "click",
        () => {
          termsAtClick = (
            document.getElementById("parktermsagreed") as HTMLInputElement
          ).checked;
        },
        true,
      ); // capture: runs before the page's inline onclick unchecks the box
    });
    expect((document.getElementById("zone") as HTMLInputElement).value).toBe(
      "622",
    );
    expect((document.getElementById("plate") as HTMLInputElement).value).toBe(
      "PRBE0001",
    );
    expect(termsAtClick).toBe(true);
    expect(posted).toEqual([
      { type: "autofill", page: "paid", result: "applied" },
    ]);
  });
  test("broken fixture changes nothing and posts skipped", () => {
    const posted = runInjection(fixture("paid-broken.html"), "paid");
    expect((document.getElementById("plate") as HTMLInputElement).value).toBe(
      "",
    );
    expect(posted).toEqual([
      { type: "autofill", page: "paid", result: "skipped" },
    ]);
  });
});

test("values containing placeholder tokens do not corrupt the script", () => {
  document.documentElement.innerHTML = fixture("paid.html");
  const posted: unknown[] = [];
  (window as any).ReactNativeWebView = {
    postMessage: (m: string) => posted.push(JSON.parse(m)),
  };
  new Function(buildInjection("paid", { ...values, plate: "__PAGE__" })!)();
  expect((document.getElementById("plate") as HTMLInputElement).value).toBe(
    "__PAGE__",
  );
  expect(posted).toEqual([
    { type: "autofill", page: "paid", result: "applied" },
  ]);
});

describe("buildInjection on /select_product", () => {
  test("fills contact fields and guest code and submits the form", () => {
    const posted = runInjection(
      fixture("select_product.html"),
      "select_product",
    );
    expect(
      (document.getElementById("guestcode") as HTMLInputElement).value,
    ).toBe("ABCD12");
    expect((document.getElementById("mobile") as HTMLInputElement).value).toBe(
      "4045550199",
    );
    expect(document.forms[0].submit).toHaveBeenCalledTimes(1);
    expect(posted).toEqual([
      { type: "autofill", page: "select_product", result: "applied" },
    ]);
  });
  test("submits the form that contains #guestcode, not forms[0]", () => {
    const decoy = '<form id="decoy" action="/search"><input id="q"></form>';
    const posted = runInjection(
      decoy + fixture("select_product.html"),
      "select_product",
    );
    const guestForm = (document.getElementById("guestcode") as HTMLInputElement)
      .form!;
    expect(document.forms[0].id).toBe("decoy");
    expect(document.forms[0].submit).not.toHaveBeenCalled();
    expect(guestForm.submit).toHaveBeenCalledTimes(1);
    expect(posted).toEqual([
      { type: "autofill", page: "select_product", result: "applied" },
    ]);
  });
  test("with an empty guest code fills the rest, never submits, posts skipped", () => {
    const posted = runInjection(
      fixture("select_product.html"),
      "select_product",
      undefined,
      { ...values, guestCode: "" },
    );
    expect((document.getElementById("mobile") as HTMLInputElement).value).toBe(
      "4045550199",
    );
    expect(
      (document.getElementById("guestcode") as HTMLInputElement).value,
    ).toBe("");
    expect(document.forms[0].submit).not.toHaveBeenCalled();
    expect(posted).toEqual([
      { type: "autofill", page: "select_product", result: "skipped" },
    ]);
  });
});

test("buildInjection returns null for success and other", () => {
  expect(buildInjection("success", values)).toBeNull();
  expect(buildInjection("other", values)).toBeNull();
});

describe("buildInjection on /checkout (Turnstile)", () => {
  const html = fixture("checkout.html");
  const tokenInput = () =>
    document.querySelector(
      'input[name="cf-turnstile-response"]',
    ) as HTMLInputElement;
  const setToken = (v: string) => {
    tokenInput().value = v;
  };
  const registerButton = () =>
    Array.from(
      document.querySelectorAll("button, input[type=submit]"),
    ).find((el) =>
      /register to park/i.test(
        (el as HTMLElement).textContent || (el as HTMLInputElement).value || "",
      ),
    ) as HTMLButtonElement;

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("posts waiting, then clicks Register exactly once when the token appears", () => {
    const posted = runInjection(html, "checkout");
    const click = jest.fn();
    registerButton().click = click;
    expect(posted[0]).toMatchObject({
      type: "autofill",
      page: "checkout",
      result: "waiting",
    });
    jest.advanceTimersByTime(1000);
    expect(click).not.toHaveBeenCalled();
    setToken("tok_123");
    jest.advanceTimersByTime(250);
    expect(click).toHaveBeenCalledTimes(1);
    expect(posted.at(-1)).toMatchObject({
      type: "autofill",
      page: "checkout",
      result: "submitted",
    });
    jest.advanceTimersByTime(5000);
    expect(click).toHaveBeenCalledTimes(1); // once-flag
  });

  test("keeps polling while Register is disabled, clicks once it is enabled", () => {
    const posted = runInjection(html, "checkout", () => {
      registerButton().disabled = true;
    });
    const click = jest.fn();
    registerButton().click = click;
    setToken("tok");
    jest.advanceTimersByTime(2000);
    expect(click).not.toHaveBeenCalled();
    registerButton().disabled = false;
    jest.advanceTimersByTime(250);
    expect(click).toHaveBeenCalledTimes(1);
    expect(posted.at(-1)).toMatchObject({ result: "submitted" });
  });

  test("posts timeout after 90 s without a token and stops polling", () => {
    const posted = runInjection(html, "checkout");
    const click = jest.fn();
    registerButton().click = click;
    jest.advanceTimersByTime(90_000);
    expect(posted.at(-1)).toMatchObject({ result: "timeout" });
    const count = posted.length;
    setToken("late");
    jest.advanceTimersByTime(2000);
    expect(posted.length).toBe(count);
    expect(click).not.toHaveBeenCalled();
  });

  test("posts skipped when no Register control exists within 2 s", () => {
    const posted = runInjection(html, "checkout", () =>
      registerButton().remove(),
    );
    jest.advanceTimersByTime(2000);
    expect(posted.at(-1)).toMatchObject({ result: "skipped" });
  });

  test("posts checkout_info with the advertised duration", () => {
    const posted = runInjection(html, "checkout");
    expect(posted).toContainEqual({
      type: "checkout_info",
      durationMs: (9 * 60 + 44) * 60 * 1000,
    });
  });

  test("never submits without a guest code", () => {
    const posted = runInjection(html, "checkout", undefined, {
      ...values,
      guestCode: "",
    });
    const click = jest.fn();
    registerButton().click = click;
    setToken("tok");
    jest.advanceTimersByTime(1000);
    expect(posted.at(-1)).toMatchObject({ result: "skipped" });
    expect(click).not.toHaveBeenCalled();
  });
});

describe("parseCheckoutDuration", () => {
  test.each([
    ["Time: 9 hours 44 minutes", (9 * 60 + 44) * 60_000],
    ["Time: 2 hours", 2 * 60 * 60_000],
    ["Time: 1 hour", 60 * 60_000],
    ["Time: 45 minutes", 45 * 60_000],
    ["Time: 1 hour 1 minute", 61 * 60_000],
    ["no time here", null],
  ])("%p -> %p", (text, expected) => {
    expect(parseCheckoutDuration(text)).toBe(expected);
  });
});

describe("parsePageParkEnd precedence", () => {
  const now = Date.UTC(2026, 10, 13, 5, 15); // 00:15 EST
  test("page text wins when within 13h15m", () => {
    const r = parsePageParkEnd(
      "Parking valid until 2026-11-13 10:00:00",
      now,
      now + 60_000,
    );
    expect(r).toEqual({ parkEnd: Date.UTC(2026, 10, 13, 15, 0), source: "page" });
  });
  test("page text beyond 13h15m is ignored; checkout duration used", () => {
    const r = parsePageParkEnd(
      "Parking valid until 2026-11-14 10:00:00",
      now,
      now + 3_600_000,
    );
    expect(r).toEqual({ parkEnd: now + 3_600_000, source: "checkout" });
  });
  test("no page text, no checkout: clock model (00:15 -> 10:00 AM)", () => {
    const r = parsePageParkEnd("Thank you", now);
    expect(r).toEqual({ parkEnd: Date.UTC(2026, 10, 13, 15, 0), source: "model" });
  });
  test("checkout expectedEnd in the past is ignored", () => {
    const r = parsePageParkEnd("Thank you", now, now - 1);
    expect(r.source).toBe("model");
  });
});

describe("parsePageParkEnd", () => {
  const now = Date.UTC(2026, 9, 31, 23, 0, 0);
  test("reads Eastern time from the page as the correct instant regardless of device zone", () => {
    const { parkEnd, source } = parsePageParkEnd(
      fixture("successful_transaction.html"),
      now,
    );
    expect(source).toBe("page");
    expect(new Date(parkEnd).toISOString()).toBe("2026-11-01T01:07:15.000Z"); // 21:07:15 EDT
  });
  test.each([
    ["Parking valid until 2027-01-15 12:00:00", "2027-01-15T17:00:00.000Z"],
    ["Parking valid until 2027-03-14 01:30:00", "2027-03-14T06:30:00.000Z"],
    ["Parking valid until 2027-03-14 03:30:00", "2027-03-14T07:30:00.000Z"],
  ])("reads %s with the correct EST/EDT offset", (text, iso) => {
    const oneHourBefore = Date.parse(iso) - 3600_000;
    const result = parsePageParkEnd(text, oneHourBefore);
    expect(result.source).toBe("page");
    expect(new Date(result.parkEnd).toISOString()).toBe(iso);
  });
  test.each([
    "valid until 12 noon 2026-10-31 21:07:15",
    "Receipt 2026-10-31 21:07:15",
  ])("falls back to the daytime model for %s", (text) => {
    expect(parsePageParkEnd(text, now)).toEqual({
      parkEnd: now + 2 * 3600_000,
      source: "model",
    });
  });
  test.each([
    ["a past time", "Parking valid until 2026-10-31 18:00:00"],
    ["a time 14h ahead", "Parking valid until 2026-11-01 09:30:00"],
    ["a trigger word inside another word", "Weekends 2026-10-31 21:07:15"],
  ])("falls back to the daytime model for %s", (_label, text) => {
    expect(parsePageParkEnd(text, now)).toEqual({
      parkEnd: now + 2 * 3600_000,
      source: "model",
    });
  });
  test("accepts a time 13h ahead across the DST fall-back (overnight product)", () => {
    // now is 19:00 EDT on 2026-10-31; 07:00 EST on 2026-11-01 is 13 h later.
    const result = parsePageParkEnd(
      "Parking valid until 2026-11-01 07:00:00",
      now,
    );
    expect(result).toEqual({ parkEnd: now + 13 * 3600_000, source: "page" });
  });
  test("accepts a time 2h15m ahead, the edge of the window", () => {
    const result = parsePageParkEnd(
      "Parking valid until 2026-10-31 21:15:00",
      now,
    );
    expect(result).toEqual({
      parkEnd: now + 2 * 3600_000 + 15 * 60_000,
      source: "page",
    });
  });
  test("falls back to the daytime model when no time is present", () => {
    expect(parsePageParkEnd("Thanks for parking", now)).toEqual({
      parkEnd: now + 2 * 3600_000,
      source: "model",
    });
  });
});

test("parseParkId and parseErrorMessage", () => {
  expect(
    parseParkId(
      "https://paid.parkeaz.com/successful_transaction?parkid=123456&zone=622",
    ),
  ).toBe("123456");
  expect(parseParkId("https://paid.parkeaz.com/checkout")).toBeNull();
  expect(
    parseErrorMessage(
      "https://paid.parkeaz.com/paid?ErrorMessage=Plate%20already%20registered",
    ),
  ).toBe("Plate already registered");
  expect(parseErrorMessage("https://paid.parkeaz.com/paid")).toBeNull();
});
