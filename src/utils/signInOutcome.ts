/**
 * Maps a Clerk `signIn.create()` result to an explicit outcome the screen
 * must act on. Every status is covered so a sign-in attempt can never end
 * as a silent no-op.
 */

export type SecondFactorStrategy = "email_code" | "phone_code" | "totp";

export type SignInFactorLike = {
  strategy: string;
  emailAddressId?: string;
  phoneNumberId?: string;
  safeIdentifier?: string;
};

export type SignInAttemptResult = {
  status: string | null;
  createdSessionId: string | null;
  supportedSecondFactors?: readonly SignInFactorLike[] | null;
};

export type SignInOutcome =
  | { kind: "complete"; sessionId: string }
  | {
      kind: "second_factor";
      strategy: SecondFactorStrategy;
      emailAddressId?: string;
      phoneNumberId?: string;
      safeIdentifier?: string;
    }
  | { kind: "new_password" }
  | {
      kind: "unsupported";
      status: string;
      reason:
        | "complete_without_session"
        | "no_supported_second_factor"
        | "unhandled_status";
    };

const SECOND_FACTOR_PRIORITY: readonly SecondFactorStrategy[] = [
  "email_code",
  "phone_code",
  "totp",
];

function pickSecondFactor(
  factors: readonly SignInFactorLike[] | null | undefined,
): SignInFactorLike | undefined {
  if (!factors || factors.length === 0) return undefined;
  for (const strategy of SECOND_FACTOR_PRIORITY) {
    const match = factors.find((f) => f.strategy === strategy);
    if (match) return match;
  }
  return undefined;
}

export function resolveSignInOutcome(
  result: SignInAttemptResult,
): SignInOutcome {
  const status = result.status ?? "null";

  if (status === "complete") {
    if (result.createdSessionId) {
      return { kind: "complete", sessionId: result.createdSessionId };
    }
    return { kind: "unsupported", status, reason: "complete_without_session" };
  }

  if (status === "needs_second_factor") {
    const factor = pickSecondFactor(result.supportedSecondFactors);
    if (!factor) {
      return {
        kind: "unsupported",
        status,
        reason: "no_supported_second_factor",
      };
    }
    return {
      kind: "second_factor",
      strategy: factor.strategy as SecondFactorStrategy,
      emailAddressId: factor.emailAddressId,
      phoneNumberId: factor.phoneNumberId,
      safeIdentifier: factor.safeIdentifier,
    };
  }

  if (status === "needs_new_password") {
    return { kind: "new_password" };
  }

  return { kind: "unsupported", status, reason: "unhandled_status" };
}

const UNSUPPORTED_MESSAGES: Record<
  Extract<SignInOutcome, { kind: "unsupported" }>["reason"],
  string
> = {
  complete_without_session:
    "Sign-in finished but no session came back. Close the app and try again.",
  no_supported_second_factor:
    "Your account needs a verification step this app can't do yet. Sign in with Google or Apple, or contact support.",
  unhandled_status:
    "We couldn't finish signing you in. Try again, or sign in with Google or Apple.",
};

export function signInOutcomeMessage(
  outcome: Extract<SignInOutcome, { kind: "unsupported" }>,
): string {
  return UNSUPPORTED_MESSAGES[outcome.reason];
}
