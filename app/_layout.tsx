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

// Register the Extend action category for expiry-warning notifications.
// opensAppToForeground: true is the honest setting — Expo's background
// notification action handler only reliably runs on Android via TaskManager,
// so we open the app and let the extend-duration screen auto-fire the
// mutation when ?autoExtend=1 is present in the route.
Notifications.setNotificationCategoryAsync("extend_24h", [
  {
    identifier: "EXTEND_24H",
    buttonTitle: "Extend 24h",
    options: { opensAppToForeground: true },
  },
]).catch((error) => {
  console.error("Failed to register extend_24h notification category:", error);
});

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

const ALLOWED_NOTIFICATION_ROUTES = [
  "/(tabs)",
  "/extend-duration",
  "/confirm-stop",
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
        // If the user tapped the Extend action button (not the notification
        // body), route to extend-duration with autoExtend=1 so the screen
        // fires the mutation immediately on mount.
        if (response.actionIdentifier === "EXTEND_24H") {
          router.push("/extend-duration?autoExtend=1");
          return;
        }

        const url = response.notification.request.content.data?.route;
        if (typeof url === "string" && isAllowedRoute(url)) {
          router.push(url);
        }
      },
    );
    return () => sub.remove();
  }, []);
}

function RootLayoutInner() {
  useNotificationObserver();

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
          name="confirm-stop"
          options={{ presentation: "modal", headerShown: false }}
        />
      </Stack>
      <WhatsNewSheet />
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

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <RootLayoutInner />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
});
