type ClerkErrorShape = {
  errors?: {
    code?: string;
    message?: string;
    longMessage?: string;
    meta?: { paramName?: string };
  }[];
};

export type FieldError = {
  field: "email" | "password" | "code" | "form";
  message: string;
};

const FRIENDLY: Record<string, FieldError> = {
  form_identifier_not_found: {
    field: "email",
    message: "We don't have an account for that email.",
  },
  form_password_incorrect: {
    field: "password",
    message: "That password doesn't match. Try again or reset it.",
  },
  form_password_pwned: {
    field: "password",
    message: "This password has shown up in a breach. Pick a different one.",
  },
  form_password_length_too_short: {
    field: "password",
    message: "Passwords need at least 8 characters.",
  },
  form_param_format_invalid: {
    field: "email",
    message: "That email doesn't look right. Double-check and try again.",
  },
  form_identifier_exists: {
    field: "email",
    message: "An account with that email already exists. Sign in instead.",
  },
  form_code_incorrect: {
    field: "code",
    message: "That code isn't right. Double-check the email we sent.",
  },
  verification_expired: {
    field: "code",
    message: "That code expired. Ask for a new one.",
  },
  session_exists: {
    field: "form",
    message: "You're already signed in.",
  },
};

export function mapClerkError(err: unknown): FieldError {
  const clerkErr = err as ClerkErrorShape;
  const first = clerkErr?.errors?.[0];
  if (!first) {
    return { field: "form", message: "Something went wrong. Try again." };
  }
  const code = first.code ?? "";
  if (code in FRIENDLY) return FRIENDLY[code];

  const paramField = first.meta?.paramName;
  const field =
    paramField === "email_address" || paramField === "identifier"
      ? "email"
      : paramField === "password"
        ? "password"
        : paramField === "code"
          ? "code"
          : "form";
  return {
    field,
    message: first.longMessage ?? first.message ?? "Couldn't complete that.",
  };
}
