// Android delivers the Clerk SSO redirect (parkdaddy://oauth_callback) as a
// real deep link, unlike iOS, so this route must exist. Sign-in itself is
// completed by GoogleSignInButton (warm path) or Clerk's client reload (cold).
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { router } from "expo-router";

// Covers the cancelled/failed Custom Tab case: if no session appears, go home.
const GRACE_MS = 8000;

export default function OAuthCallback() {
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      router.replace("/(tabs)");
      return;
    }
    const timer = setTimeout(() => router.replace("/(auth)/welcome"), GRACE_MS);
    return () => clearTimeout(timer);
  }, [isLoaded, isSignedIn]);

  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
});
