import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from "@expo-google-fonts/bricolage-grotesque";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";

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

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
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
}
