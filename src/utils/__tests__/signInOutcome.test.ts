import {
  resolveSignInOutcome,
  signInOutcomeMessage,
  type SignInAttemptResult,
} from "../signInOutcome";

function attempt(partial: Partial<SignInAttemptResult>): SignInAttemptResult {
  return {
    status: null,
    createdSessionId: null,
    supportedSecondFactors: null,
    ...partial,
  };
}

describe("resolveSignInOutcome", () => {
  // Happy path
  test("complete with a session id yields complete outcome", () => {
    const outcome = resolveSignInOutcome(
      attempt({ status: "complete", createdSessionId: "sess_1" }),
    );

    expect(outcome).toEqual({ kind: "complete", sessionId: "sess_1" });
  });

  // Edge: complete but Clerk returned no session (should never happen, must not be silent)
  test("complete without a session id is unsupported, not silent", () => {
    const outcome = resolveSignInOutcome(
      attempt({ status: "complete", createdSessionId: null }),
    );

    expect(outcome).toMatchObject({
      kind: "unsupported",
      status: "complete",
      reason: "complete_without_session",
    });
  });

  // needs_second_factor
  test("email_code second factor is selected and carries emailAddressId", () => {
    const outcome = resolveSignInOutcome(
      attempt({
        status: "needs_second_factor",
        supportedSecondFactors: [
          {
            strategy: "email_code",
            emailAddressId: "idn_1",
            safeIdentifier: "a***@b.com",
          },
        ],
      }),
    );

    expect(outcome).toEqual({
      kind: "second_factor",
      strategy: "email_code",
      emailAddressId: "idn_1",
      phoneNumberId: undefined,
      safeIdentifier: "a***@b.com",
    });
  });

  test("email_code wins over phone_code and totp regardless of order", () => {
    const outcome = resolveSignInOutcome(
      attempt({
        status: "needs_second_factor",
        supportedSecondFactors: [
          { strategy: "totp" },
          { strategy: "phone_code", phoneNumberId: "idn_p" },
          { strategy: "email_code", emailAddressId: "idn_e" },
        ],
      }),
    );

    expect(outcome).toMatchObject({
      kind: "second_factor",
      strategy: "email_code",
    });
  });

  test("phone_code is used when email_code is absent", () => {
    const outcome = resolveSignInOutcome(
      attempt({
        status: "needs_second_factor",
        supportedSecondFactors: [
          { strategy: "phone_code", phoneNumberId: "idn_p" },
        ],
      }),
    );

    expect(outcome).toMatchObject({
      kind: "second_factor",
      strategy: "phone_code",
      phoneNumberId: "idn_p",
    });
  });

  test("totp is used when it is the only supported factor", () => {
    const outcome = resolveSignInOutcome(
      attempt({
        status: "needs_second_factor",
        supportedSecondFactors: [{ strategy: "totp" }],
      }),
    );

    expect(outcome).toMatchObject({ kind: "second_factor", strategy: "totp" });
  });

  test("second factor with only unknown strategies is unsupported", () => {
    const outcome = resolveSignInOutcome(
      attempt({
        status: "needs_second_factor",
        supportedSecondFactors: [
          { strategy: "backup_code" },
          { strategy: "email_link" },
        ],
      }),
    );

    expect(outcome).toMatchObject({
      kind: "unsupported",
      status: "needs_second_factor",
      reason: "no_supported_second_factor",
    });
  });

  test("second factor with empty or missing factor list is unsupported", () => {
    expect(
      resolveSignInOutcome(
        attempt({ status: "needs_second_factor", supportedSecondFactors: [] }),
      ),
    ).toMatchObject({
      kind: "unsupported",
      reason: "no_supported_second_factor",
    });

    expect(
      resolveSignInOutcome(
        attempt({
          status: "needs_second_factor",
          supportedSecondFactors: null,
        }),
      ),
    ).toMatchObject({
      kind: "unsupported",
      reason: "no_supported_second_factor",
    });
  });

  // needs_new_password
  test("needs_new_password yields new_password outcome", () => {
    const outcome = resolveSignInOutcome(
      attempt({ status: "needs_new_password" }),
    );

    expect(outcome).toEqual({ kind: "new_password" });
  });

  // Remaining statuses must surface, never no-op
  test.each(["needs_first_factor", "needs_identifier"])(
    "%s is unsupported with the status recorded",
    (status) => {
      const outcome = resolveSignInOutcome(attempt({ status }));

      expect(outcome).toMatchObject({
        kind: "unsupported",
        status,
        reason: "unhandled_status",
      });
    },
  );

  test("null status is unsupported", () => {
    const outcome = resolveSignInOutcome(attempt({ status: null }));

    expect(outcome).toMatchObject({
      kind: "unsupported",
      status: "null",
      reason: "unhandled_status",
    });
  });
});

describe("signInOutcomeMessage", () => {
  test("unsupported outcomes always produce non-empty user-facing text", () => {
    const message = signInOutcomeMessage({
      kind: "unsupported",
      status: "needs_first_factor",
      reason: "unhandled_status",
    });

    expect(message.length).toBeGreaterThan(0);
  });

  test("no_supported_second_factor message points the user at Google or Apple sign-in", () => {
    const message = signInOutcomeMessage({
      kind: "unsupported",
      status: "needs_second_factor",
      reason: "no_supported_second_factor",
    });

    expect(message).toMatch(/Google|Apple/);
  });
});
