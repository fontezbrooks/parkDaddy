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

Sentry.init({
  dsn: "https://c5e178a1ee7e58a13119ca9eb07ed0fe@o4510285264715776.ingest.us.sentry.io/4510285279985664",

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
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
    <Stack screenOptions={{ headerShown: false }}>
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
