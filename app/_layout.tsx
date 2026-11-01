import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { useFonts } from "expo-font";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
} from "@expo-google-fonts/figtree";
import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from "@expo-google-fonts/bricolage-grotesque";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import * as Sentry from "@sentry/react-native";
import { WhatsNewSheet } from "@/src/components/WhatsNewSheet";
import { AnimatedSplash } from "@/src/components/splash/AnimatedSplash";
import { useAppReady } from "@/src/hooks/useAppReady";
import { parseRenewParams } from "@/src/parkeaz/renewFlow";

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: sentryDsn,
  enabled: !!sentryDsn,

  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [
    Sentry.mobileReplayIntegration(),
    Sentry.feedbackIntegration(),
  ],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

const ALLOWED_NOTIFICATION_ROUTES = [
  "/(tabs)",
  "/extend-duration",
  "/confirm-stop",
  "/renew",
] as const;

function isAllowedRoute(
  route: string,
): route is (typeof ALLOWED_NOTIFICATION_ROUTES)[number] {
  return (ALLOWED_NOTIFICATION_ROUTES as readonly string[]).includes(route);
}

function useNotificationObserver() {
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data ?? {};
        const url = data.route;
        if (typeof url !== "string" || !isAllowedRoute(url)) return;
        if (url === "/renew") {
          const sessionId = parseRenewParams(data) ?? "";
          router.push(`/renew?sessionId=${encodeURIComponent(sessionId)}`);
          return;
        }
        router.push(url);
      },
    );
    return () => sub.remove();
  }, []);
}

function RootLayoutInner({
  fontsLoaded,
  fontError,
}: {
  fontsLoaded: boolean;
  fontError: Error | null;
}) {
  useNotificationObserver();
  const appReady = useAppReady({ fontsLoaded, fontError });

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="start-parking"
          options={{ headerShown: true, title: "Park a Guest" }}
        />
        <Stack.Screen
          name="extend-duration"
          options={{ headerShown: true, title: "Extend Parking" }}
        />
        <Stack.Screen
          name="renew"
          options={{ headerShown: true, title: "Renew Parking" }}
        />
        <Stack.Screen
          name="confirm-stop"
          options={{ presentation: "modal", headerShown: false }}
        />
      </Stack>
      <WhatsNewSheet />
      <AnimatedSplash appReady={appReady} />
    </>
  );
}

export default Sentry.wrap(function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });

  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <RootLayoutInner fontsLoaded={fontsLoaded} fontError={fontError} />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
});
