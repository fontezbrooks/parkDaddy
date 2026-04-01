import { useState, useCallback } from "react";
import { View, Text, TextInput, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSignUp } from "@clerk/clerk-expo";
import { router } from "expo-router";
import { colors, typography, spacing, radius } from "@/src/theme";
import { GradientButton } from "@/src/components/GradientButton";

export default function SignUpScreen() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignUp = useCallback(async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError("");

    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (err: any) {
      setError(err.errors?.[0]?.message ?? "Sign up failed");
    } finally {
      setLoading(false);
    }
  }, [isLoaded, email, password, signUp]);

  const handleVerify = useCallback(async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError("");

    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/(auth)/profile-setup");
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.message ?? "Verification failed");
    } finally {
      setLoading(false);
    }
  }, [isLoaded, code, signUp, setActive]);

  if (pendingVerification) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={[typography.headlineLg, styles.title]}>Verify Email</Text>
        <Text style={[typography.bodyMd, { color: colors.onSurfaceVariant }]}>
          We sent a verification code to {email}
        </Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Verification code"
            placeholderTextColor={colors.onSurfaceVariant}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
          />
          {error ? (
            <Text style={[typography.bodySm, { color: colors.secondary }]}>
              {error}
            </Text>
          ) : null}
          <GradientButton
            title={loading ? "Verifying..." : "Verify"}
            onPress={handleVerify}
            disabled={loading || !code}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <Text style={[typography.bodyLg, { color: colors.primary }]}>Back</Text>
      </Pressable>

      <Text style={[typography.headlineLg, styles.title]}>Create Account</Text>

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
          textContentType="newPassword"
        />

        {error ? (
          <Text style={[typography.bodySm, { color: colors.secondary }]}>
            {error}
          </Text>
        ) : null}

        <GradientButton
          title={loading ? "Creating account..." : "Create Account"}
          onPress={handleSignUp}
          disabled={loading || !email || !password}
        />
      </View>

      <Pressable
        onPress={() => router.push("/(auth)/sign-in")}
        style={styles.switchLink}
      >
        <Text style={[typography.bodyMd, { color: colors.onSurfaceVariant }]}>
          Already have an account?{" "}
          <Text style={{ color: colors.primary }}>Sign In</Text>
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
    marginTop: spacing.lg,
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
