const MAP: Array<{ match: RegExp; friendly: string }> = [
  {
    match: /active parking session already exists/i,
    friendly: "You already have a guest parked. End that session first.",
  },
  {
    match: /profile not found/i,
    friendly: "Finish profile setup before parking.",
  },
  {
    match: /invalid license plate/i,
    friendly: "That plate doesn't look right. Check the characters.",
  },
  {
    match: /duration must be between/i,
    friendly: "Pick a duration between 1 minute and 24 hours.",
  },
  {
    match: /unauthenticated/i,
    friendly: "Sign in again to continue.",
  },
  {
    match: /not authorized/i,
    friendly: "You can't modify that session.",
  },
  {
    match: /not in failed state/i,
    friendly: "This session isn't in a retryable state.",
  },
];

export function mapConvexError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Something went wrong. Try again.";
  for (const entry of MAP) {
    if (entry.match.test(raw)) return entry.friendly;
  }
  return raw.replace(/^\[.*?\]\s*/, "").trim() || "Something went wrong.";
}
