import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Stack, useSegments } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const profile = useQuery(api.users.getProfile);
  const segments = useSegments();

  if (!isLoaded) return null;

  // Wait for Convex query to resolve (undefined = loading)
  if (isSignedIn && profile === undefined) return null;

  // Signed in with profile → go to main app
  if (isSignedIn && profile) {
    return <Redirect href="/(tabs)" />;
  }

  // Signed in, no profile, NOT already on profile-setup → redirect there
  const onProfileSetup = segments.includes("profile-setup" as never);
  if (isSignedIn && profile === null && !onProfileSetup) {
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
