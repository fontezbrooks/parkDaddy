import { useEffect, useRef } from "react";
import { Stack, router, useRootNavigationState } from "expo-router";
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
import { routeForNotificationData } from "@/src/notifications/routeForNotificationData";

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

type HandledRef = { current: string | null };

// Routes a tapped push once; the warm listener and the cold-start response
// can both report the same tap, keyed by its request identifier.
function openNotificationRoute(
  response: Notifications.NotificationResponse,
  handledRef: HandledRef,
): void {
  const id = response.notification.request.identifier;
  if (handledRef.current === id) return;
  const route = routeForNotificationData(
    response.notification.request.content.data,
  );
  if (!route) return;
  handledRef.current = id;
  router.push(route);
}

function useNotificationObserver(appReady: boolean) {
  const handledRef = useRef<string | null>(null);
  const isNavigatorMounted = Boolean(useRootNavigationState()?.key);
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => openNotificationRoute(response, handledRef),
    );
    return () => sub.remove();
  }, []);

  // Cold start: the tap that launched the app arrives before any listener.
  useEffect(() => {
    if (!lastResponse || !isNavigatorMounted || !appReady) return;
    openNotificationRoute(lastResponse, handledRef);
  }, [lastResponse, isNavigatorMounted, appReady]);
}

function RootLayoutInner({
  fontsLoaded,
  fontError,
}: {
  fontsLoaded: boolean;
  fontError: Error | null;
}) {
  const appReady = useAppReady({ fontsLoaded, fontError });
  useNotificationObserver(appReady);

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
