import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSignIn } from "@clerk/clerk-expo";
import { router } from "expo-router";
import { colors, typography, spacing } from "@/src/theme";
import { GradientButton } from "@/src/components/GradientButton";
import { GoogleSignInButton } from "@/src/components/GoogleSignInButton";
import { AppleSignInButton } from "@/src/components/AppleSignInButton";
import { FormField, PasswordToggle } from "@/src/components/FormField";
import { mapClerkError } from "@/src/utils/clerkErrors";
import {
  biometricAvailableAsync,
  getLastEmail,
  promptBiometric,
  rememberLastEmail,
} from "@/src/utils/biometric";

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [biometricReady, setBiometricReady] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    (async () => {
      const available = await biometricAvailableAsync();
      const last = await getLastEmail();
      if (available && last) {
        setEmail(last);
        setBiometricReady(true);
      }
    })();
  }, []);

  const clearErrors = () => {
    setEmailError("");
    setPasswordError("");
    setFormError("");
  };

  const handleSignIn = useCallback(async () => {
    if (!isLoaded) return;
    setLoading(true);
    clearErrors();

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === "complete") {
        await rememberLastEmail(email);
        await setActive({ session: result.createdSessionId });
        router.replace("/(tabs)");
      }
    } catch (err: unknown) {
      const mapped = mapClerkError(err);
      setAttempts((n) => n + 1);
      if (mapped.field === "email") setEmailError(mapped.message);
      else if (mapped.field === "password") setPasswordError(mapped.message);
      else setFormError(mapped.message);
    } finally {
      setLoading(false);
    }
  }, [isLoaded, email, password, signIn, setActive]);

  const handleBiometricUnlock = useCallback(async () => {
    const ok = await promptBiometric("Sign in to parkDaddy");
    if (ok) {
      passwordRef.current?.focus();
    }
  }, []);

  const canSubmit = email.length > 0 && password.length > 0 && !loading;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Text style={[typography.titleLg, styles.backLabel]}>
              ← Back
            </Text>
          </Pressable>

          <Text style={[typography.displaySm, styles.title]}>
            Welcome back.
          </Text>
          <Text style={[typography.bodyLg, styles.subtitle]}>
            Sign in to keep your guests parked.
          </Text>

          <View style={styles.form}>
            <FormField
              label="Email"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (emailError) setEmailError("");
              }}
              error={emailError}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
              placeholder="you@email.com"
            />

            <FormField
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (passwordError) setPasswordError("");
              }}
              error={passwordError}
              secureTextEntry={!showPassword}
              textContentType="password"
              autoComplete="current-password"
              returnKeyType="go"
              onSubmitEditing={canSubmit ? handleSignIn : undefined}
              placeholder="Your password"
              trailing={
                <PasswordToggle
                  visible={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                />
              }
            />

            {formError ? (
              <View style={styles.formErrorBox}>
                <Text style={[typography.bodySm, styles.formErrorText]}>
                  {formError}
                </Text>
              </View>
            ) : null}

            <GradientButton
              title={loading ? "Signing in…" : "Sign in"}
              onPress={handleSignIn}
              disabled={!canSubmit}
              loading={loading}
            />

            {attempts >= 2 ? (
              <Pressable
                onPress={() => router.push("/(auth)/sign-in")}
                hitSlop={12}
                style={styles.forgot}
                accessibilityRole="button"
              >
                <Text style={[typography.bodyMd, styles.forgotText]}>
                  Forgot password?
                </Text>
              </Pressable>
            ) : null}

            {biometricReady ? (
              <Pressable
                onPress={handleBiometricUnlock}
                hitSlop={12}
                style={styles.biometric}
                accessibilityRole="button"
                accessibilityLabel="Unlock with Face ID"
              >
                <Text style={[typography.bodyMd, styles.biometricText]}>
                  Use Face ID to unlock
                </Text>
              </Pressable>
            ) : null}

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text
                style={[typography.labelSm, { color: colors.onSurfaceMuted }]}
              >
                or
              </Text>
              <View style={styles.dividerLine} />
            </View>

            <AppleSignInButton label="Sign in with Apple" />
            <GoogleSignInButton label="Sign in with Google" />
          </View>

          <Pressable
            onPress={() => router.push("/(auth)/sign-up")}
            style={styles.switchLink}
            hitSlop={12}
            accessibilityRole="button"
          >
            <Text style={[typography.bodyMd, { color: colors.onSurfaceVariant }]}>
              New here?{" "}
              <Text style={styles.switchLinkEmphasis}>Create an account</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  kav: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing["2xl"],
    paddingBottom: spacing["3xl"],
  },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  backLabel: {
    color: colors.primary,
  },
  title: {
    color: colors.onSurface,
    marginTop: spacing.xl,
  },
  subtitle: {
    color: colors.onSurfaceVariant,
    marginTop: spacing.sm,
    marginBottom: spacing["2xl"],
  },
  form: {
    gap: spacing.lg,
  },
  formErrorBox: {
    backgroundColor: colors.errorContainer,
    padding: spacing.md,
    borderRadius: 8,
  },
  formErrorText: {
    color: colors.error,
  },
  forgot: {
    alignSelf: "center",
  },
  forgotText: {
    color: colors.primary,
  },
  biometric: {
    alignSelf: "center",
    paddingVertical: spacing.sm,
  },
  biometricText: {
    color: colors.primary,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginVertical: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.outlineVariant,
  },
  switchLink: {
    alignItems: "center",
    marginTop: spacing["3xl"],
  },
  switchLinkEmphasis: {
    color: colors.primary,
    fontFamily: "Figtree_600SemiBold",
  },
});
