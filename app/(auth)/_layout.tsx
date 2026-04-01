import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Stack } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const profile = useQuery(api.users.getProfile);

  if (!isLoaded) return null;

  if (isSignedIn && profile) {
    return <Redirect href="/(tabs)" />;
  }

  if (isSignedIn && profile === null) {
    return <Redirect href="/(auth)/profile-setup" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="profile-setup" />
    </Stack>
  );
}
