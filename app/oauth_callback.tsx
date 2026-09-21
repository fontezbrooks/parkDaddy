// Android delivers the Clerk SSO redirect (parkdaddy://oauth_callback) as a
// real deep link, unlike iOS, so this route must exist. Warm path: the
// startSSOFlow promise in GoogleSignInButton finishes sign-in and this screen
// only waits. Cold path: Android killed the process behind the Custom Tab, the
// promise is gone, so this screen performs the same exchange useSSO would have.
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { useAuth, useSignIn, useSignUp } from "@clerk/clerk-expo";
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import * as Sentry from "@sentry/react-native";
import { hasStartedSsoFlow } from "@/src/utils/ssoFlowState";

// Covers the cancelled/failed Custom Tab case: if no session appears, go home.
const GRACE_MS = 8000;
const CALLBACK_PATH = "oauth_callback";
const NONCE_PARAM = "rotating_token_nonce";
const MAX_NONCE_LENGTH = 512;

// A nonce is single-use. Guards against the effect re-running mid-exchange.
const claimedNonces = new Set<string>();

type SignInHook = ReturnType<typeof useSignIn>;
type SignUpHook = ReturnType<typeof useSignUp>;

type ExchangeDeps = {
  signIn: NonNullable<SignInHook["signIn"]>;
  signUp: NonNullable<SignUpHook["signUp"]>;
  setActive: NonNullable<SignInHook["setActive"]>;
};

function toNonce(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > MAX_NONCE_LENGTH) return null;
  return value;
}

// Fallback for a cold start where the router did not surface query params.
// expo-linking reports "scheme://oauth_callback" as hostname, not path.
function readNonceFromUrl(url: string | null): string | null {
  if (!url) return null;
  const { hostname, path, queryParams } = Linking.parse(url);
  if (hostname !== CALLBACK_PATH && path !== CALLBACK_PATH) return null;
  return toNonce(queryParams?.[NONCE_PARAM]);
}

// Returns a nonce only when this screen is the sole party able to use it: no
// SSO flow was ever started in this JS runtime, so no promise is pending.
async function claimOrphanedNonce(
  routeNonce: string | null,
): Promise<string | null> {
  if (hasStartedSsoFlow()) return null;
  const nonce = routeNonce ?? readNonceFromUrl(await Linking.getInitialURL());
  if (!nonce || claimedNonces.has(nonce)) return null;
  claimedNonces.add(nonce);
  return nonce;
}

// Mirrors @clerk/clerk-expo useSSO after openAuthSessionAsync resolves.
async function exchangeNonce(
  { signIn, signUp, setActive }: ExchangeDeps,
  rotatingTokenNonce: string,
): Promise<void> {
  await signIn.reload({ rotatingTokenNonce });
  if (signIn.firstFactorVerification.status === "transferable") {
    await signUp.create({ transfer: true });
  }
  const sessionId = signUp.createdSessionId ?? signIn.createdSessionId;
  if (!sessionId) {
    throw new Error("SSO cold-start exchange produced no session");
  }
  await setActive({ session: sessionId });
}

async function completeColdStart(
  deps: ExchangeDeps | null,
  routeNonce: string | null,
): Promise<void> {
  if (!deps) return;
  const nonce = await claimOrphanedNonce(routeNonce);
  if (!nonce) return;
  Sentry.addBreadcrumb({
    category: "auth",
    message: "sso_cold_start_exchange",
  });
  await exchangeNonce(deps, nonce);
}

export default function OAuthCallback() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signIn, setActive, isLoaded: isSignInLoaded } = useSignIn();
  const { signUp, isLoaded: isSignUpLoaded } = useSignUp();
  const params = useLocalSearchParams();
  const routeNonce = toNonce(params[NONCE_PARAM]);

  // Clerk swaps these resource objects as the exchange progresses. Keeping
  // them in a ref stops that from re-running the effect below mid-flight.
  const clerkRef = useRef<ExchangeDeps | null>(null);
  useEffect(() => {
    clerkRef.current = signIn && signUp ? { signIn, signUp, setActive } : null;
  }, [signIn, signUp, setActive]);

  const isClerkReady = isLoaded && isSignInLoaded && isSignUpLoaded;

  useEffect(() => {
    if (!isClerkReady) return;
    if (isSignedIn) {
      router.replace("/(tabs)");
      return;
    }

    let isCancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startGracePeriod = () => {
      if (isCancelled) return;
      timer = setTimeout(() => router.replace("/(auth)/welcome"), GRACE_MS);
    };

    completeColdStart(clerkRef.current, routeNonce)
      .catch((error: unknown) => Sentry.captureException(error))
      .finally(startGracePeriod);

    return () => {
      isCancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isClerkReady, isSignedIn, routeNonce]);

  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
});
