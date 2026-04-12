import { useState, useCallback } from "react";
import { Text, Pressable, StyleSheet, View } from "react-native";
import { useSSO } from "@clerk/clerk-expo";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { colors, typography, spacing, radius } from "@/src/theme";
import * as Sentry from "@sentry/react-native";
WebBrowser.maybeCompleteAuthSession();

type Props = {
  label?: string;
};

export function GoogleSignInButton({ label = "Continue with Google" }: Props) {
  const { startSSOFlow } = useSSO();
  const [loading, setLoading] = useState(false);

  const handlePress = useCallback(async () => {
    setLoading(true);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: Linking.createURL("oauth_callback"),
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace("/(tabs)");
      }
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String((error as { message?: unknown }).message)
          : undefined;
      console.error(
        "Google SSO sign-in failed or was cancelled:",
        message ?? "(no error message)",
      );
    } finally {
      setLoading(false);
    }
  }, [startSSOFlow]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading}
      style={[styles.button, loading && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.googleIcon}>
        <Text style={styles.googleG}>G</Text>
      </View>
      <Text style={[typography.titleLg, styles.label]}>
        {loading ? "Signing in..." : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing["2xl"],
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    gap: spacing.md,
    minHeight: 52,
  },
  disabled: {
    opacity: 0.5,
  },
  googleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  googleG: {
    fontSize: 16,
    fontFamily: "Figtree_700Bold",
    color: "#4285F4",
  },
  label: {
    color: colors.onSurface,
  },
});
