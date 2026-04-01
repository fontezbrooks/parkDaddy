import { useState, useCallback } from "react";
import { View, Text, TextInput, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSignIn } from "@clerk/clerk-expo";
import { router } from "expo-router";
import { colors, typography, spacing, radius } from "@/src/theme";
import { GradientButton } from "@/src/components/GradientButton";

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignIn = useCallback(async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError("");

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/(tabs)");
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.message ?? "Sign in failed");
    } finally {
      setLoading(false);
    }
  }, [isLoaded, email, password, signIn, setActive]);

  return (
    <SafeAreaView style={styles.container}>
      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <Text style={[typography.bodyLg, { color: colors.primary }]}>Back</Text>
      </Pressable>

      <Text style={[typography.headlineLg, styles.title]}>Sign In</Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.onSurfaceVariant}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.onSurfaceVariant}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
        />

        {error ? (
          <Text style={[typography.bodySm, { color: colors.secondary }]}>
            {error}
          </Text>
        ) : null}

        <GradientButton
          title={loading ? "Signing in..." : "Sign In"}
          onPress={handleSignIn}
          disabled={loading || !email || !password}
        />
      </View>

      <Pressable
        onPress={() => router.push("/(auth)/sign-up")}
        style={styles.switchLink}
      >
        <Text style={[typography.bodyMd, { color: colors.onSurfaceVariant }]}>
          No account? <Text style={{ color: colors.primary }}>Sign Up</Text>
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  backButton: {
    paddingVertical: spacing.md,
  },
  title: {
    color: colors.onSurface,
    marginTop: spacing["2xl"],
    marginBottom: spacing["3xl"],
  },
  form: {
    gap: spacing.lg,
  },
  input: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: colors.onSurface,
  },
  switchLink: {
    alignItems: "center",
    marginTop: spacing["3xl"],
  },
});
