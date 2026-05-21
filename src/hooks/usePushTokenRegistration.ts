import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== "granted") {
    const { status: requested } = await Notifications.requestPermissionsAsync();
    status = requested;
  }
  if (status !== "granted") return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn("[push] No EAS projectId; skipping push token registration");
    return null;
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({
    projectId,
  });
  return tokenResponse.data;
}

export function usePushTokenRegistration() {
  const saveToken = useMutation(api.pushTokens.save);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const token = await registerForPushNotifications();
        if (!token || cancelled) return;
        await saveToken({ token, platform: Platform.OS });
      } catch (error) {
        console.error("[push] registration failed:", error);
      }
    })();

    const sub = Notifications.addPushTokenListener((event) => {
      saveToken({ token: event.data, platform: Platform.OS }).catch((error) => {
        console.error("[push] refresh save failed:", error);
      });
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [saveToken]);
}
