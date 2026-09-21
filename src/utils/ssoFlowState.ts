// One-way latch living in JS memory, so it dies exactly when a pending
// startSSOFlow promise dies (process or JS runtime restart). An SSO callback
// arriving in a runtime that never started a flow can only belong to a dead
// predecessor, which means nobody is left to finish the sign-in.
let hasStarted = false;

export function markSsoFlowStarted(): void {
  hasStarted = true;
}

export function hasStartedSsoFlow(): boolean {
  return hasStarted;
}
