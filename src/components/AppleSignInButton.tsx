import { useCallback, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSSO } from "@clerk/clerk-expo";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { colors, typography, spacing, radius } from "@/src/theme";

type Props = {
  label?: string;
};

export function AppleSignInButton({ label = "Continue with Apple" }: Props) {
  const { startSSOFlow } = useSSO();
  const [loading, setLoading] = useState(false);

  const handlePress = useCallback(async () => {
    if (Platform.OS !== "ios") return;
    setLoading(true);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_apple",
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
        "Apple SSO sign-in failed or was cancelled:",
        message ?? "(no error message)",
      );
    } finally {
      setLoading(false);
    }
  }, [startSSOFlow]);

  if (Platform.OS !== "ios") return null;

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading}
      style={[styles.button, loading && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.icon}>
        <Text style={styles.apple}></Text>
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
    backgroundColor: colors.onSurface,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing["2xl"],
    gap: spacing.md,
  },
  disabled: {
    opacity: 0.5,
  },
  icon: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  apple: {
    color: colors.onPrimary,
    fontSize: 20,
    marginTop: -3,
  },
  label: {
    color: colors.onPrimary,
  },
});
