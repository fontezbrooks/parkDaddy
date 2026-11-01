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
  page: "paid" | "select_product",
  setup?: () => void,
) {
  document.documentElement.innerHTML = html;
  const posted: unknown[] = [];
  (window as any).ReactNativeWebView = {
    postMessage: (m: string) => posted.push(JSON.parse(m)),
  };
  for (const f of Array.from(document.forms)) f.submit = jest.fn();
  setup?.();
  new Function(buildInjection(page, values)!)();
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
});

test("buildInjection returns null for checkout, success, other", () => {
  expect(buildInjection("checkout", values)).toBeNull();
  expect(buildInjection("success", values)).toBeNull();
  expect(buildInjection("other", values)).toBeNull();
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
    const result = parsePageParkEnd(text, now);
    expect(result.source).toBe("page");
    expect(new Date(result.parkEnd).toISOString()).toBe(iso);
  });
  test.each([
    "valid until 12 noon 2026-10-31 21:07:15",
    "Receipt 2026-10-31 21:07:15",
  ])("falls back for %s", (text) => {
    expect(parsePageParkEnd(text, now)).toEqual({
      parkEnd: now + 2 * 3600_000,
      source: "fallback",
    });
  });
  test("falls back to now + 2h when no time is present", () => {
    expect(parsePageParkEnd("Thanks for parking", now)).toEqual({
      parkEnd: now + 2 * 3600_000,
      source: "fallback",
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
