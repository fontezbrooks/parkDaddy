import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Stack, useSegments } from "expo-router";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { resolveAuthGate } from "@/src/auth/authGate";

export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const convexAuth = useConvexAuth();
  const profile = useQuery(
    api.users.getProfile,
    convexAuth.isAuthenticated ? {} : "skip",
  );
  const segments = useSegments();

  const gate = resolveAuthGate({
    clerkLoaded: isLoaded,
    isSignedIn: Boolean(isSignedIn),
    convexLoading: convexAuth.isLoading,
    convexAuthenticated: convexAuth.isAuthenticated,
    profile,
  });

  if (gate === "loading") return null;
  if (gate === "ready") return <Redirect href="/(tabs)" />;

  const onProfileSetup = segments.includes("profile-setup" as never);
  if (gate === "needs-profile" && !onProfileSetup) {
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
