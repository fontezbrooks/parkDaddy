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
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSignUp } from "@clerk/clerk-expo";
import { router } from "expo-router";
import { colors, typography, spacing } from "@/src/theme";
import { GradientButton } from "@/src/components/GradientButton";
import { GoogleSignInButton } from "@/src/components/GoogleSignInButton";
import { AppleSignInButton } from "@/src/components/AppleSignInButton";
import { FormField, PasswordToggle } from "@/src/components/FormField";
import { OtpInput } from "@/src/components/OtpInput";
import { mapClerkError } from "@/src/utils/clerkErrors";

const TERMS_URL = "https://fontezbrooks.github.io/parkDaddy";
const PRIVACY_URL = "https://fontezbrooks.github.io/parkDaddy";
const RESEND_COOLDOWN_SECS = 30;

export default function SignUpScreen() {
  const { signUp, setActive, isLoaded } = useSignUp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");

  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [formError, setFormError] = useState("");

  const [pendingVerification, setPendingVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => {
      setResendCooldown((n) => Math.max(0, n - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const clearErrors = () => {
    setEmailError("");
    setPasswordError("");
    setCodeError("");
    setFormError("");
  };

  const handleSignUp = useCallback(async () => {
    if (!isLoaded) return;
    setLoading(true);
    clearErrors();

    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
      setResendCooldown(RESEND_COOLDOWN_SECS);
    } catch (err: unknown) {
      const mapped = mapClerkError(err);
      if (mapped.field === "email") setEmailError(mapped.message);
      else if (mapped.field === "password") setPasswordError(mapped.message);
      else setFormError(mapped.message);
    } finally {
      setLoading(false);
    }
  }, [isLoaded, email, password, signUp]);

  const handleVerify = useCallback(
    async (overrideCode?: string) => {
      if (!isLoaded) return;
      const submitCode = overrideCode ?? code;
      if (submitCode.length < 6) return;
      setLoading(true);
      clearErrors();

      try {
        const result = await signUp.attemptEmailAddressVerification({
          code: submitCode,
        });
        if (result.status === "complete") {
          await setActive({ session: result.createdSessionId });
          router.replace("/(auth)/profile-setup");
        }
      } catch (err: unknown) {
        const mapped = mapClerkError(err);
        if (mapped.field === "code") setCodeError(mapped.message);
        else setFormError(mapped.message);
        setCode("");
      } finally {
        setLoading(false);
      }
    },
    [isLoaded, code, signUp, setActive],
  );

  const handleResend = useCallback(async () => {
    if (!isLoaded || resendCooldown > 0) return;
    clearErrors();
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setResendCooldown(RESEND_COOLDOWN_SECS);
    } catch (err: unknown) {
      const mapped = mapClerkError(err);
      setFormError(mapped.message);
    }
  }, [isLoaded, signUp, resendCooldown]);

  const handleEditEmail = useCallback(() => {
    setPendingVerification(false);
    setCode("");
    clearErrors();
  }, []);

  const canCreate = email.length > 0 && password.length >= 8 && !loading;

  if (pendingVerification) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.kav}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable
              onPress={handleEditEmail}
              style={styles.backButton}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Back to email"
            >
              <Text style={[typography.titleLg, styles.backLabel]}>← Back</Text>
            </Pressable>

            <Text style={[typography.displaySm, styles.title]}>
              Check your email.
            </Text>
            <Text style={[typography.bodyLg, styles.subtitle]}>
              We sent a 6-digit code to{" "}
              <Text style={styles.subtitleEmphasis}>{email}</Text>.
            </Text>

            <View style={styles.otpBlock}>
              <OtpInput
                value={code}
                onChange={(v) => {
                  setCode(v);
                  if (codeError) setCodeError("");
                }}
                onComplete={(v) => handleVerify(v)}
                error={Boolean(codeError)}
              />
              {codeError ? (
                <Text style={[typography.bodySm, styles.errorInline]}>
                  {codeError}
                </Text>
              ) : null}
            </View>

            {formError ? (
              <View style={styles.formErrorBox}>
                <Text style={[typography.bodySm, styles.formErrorText]}>
                  {formError}
                </Text>
              </View>
            ) : null}

            <GradientButton
              title={loading ? "Verifying…" : "Verify"}
              onPress={() => handleVerify()}
              disabled={code.length < 6 || loading}
              loading={loading}
            />

            <View style={styles.resendRow}>
              <Text
                style={[typography.bodyMd, { color: colors.onSurfaceVariant }]}
              >
                No code?{" "}
              </Text>
              <Pressable
                onPress={handleResend}
                disabled={resendCooldown > 0}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Resend verification code"
              >
                <Text
                  style={[
                    typography.bodyMd,
                    resendCooldown > 0 ? styles.resendDisabled : styles.resend,
                  ]}
                >
                  {resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : "Resend"}
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={handleEditEmail}
              hitSlop={12}
              style={styles.editEmail}
              accessibilityRole="button"
            >
              <Text
                style={[typography.bodyMd, { color: colors.onSurfaceVariant }]}
              >
                Wrong email?{" "}
                <Text style={styles.editEmailLink}>Start over</Text>
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

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
            <Text style={[typography.titleLg, styles.backLabel]}>← Back</Text>
          </Pressable>

          <Text style={[typography.displaySm, styles.title]}>
            Create your account.
          </Text>
          <Text style={[typography.bodyLg, styles.subtitle]}>
            Takes about a minute. We only ask for what we need.
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
              textContentType="newPassword"
              autoComplete="new-password"
              returnKeyType="go"
              onSubmitEditing={canCreate ? handleSignUp : undefined}
              placeholder="At least 8 characters"
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
              title={loading ? "Creating…" : "Create account"}
              onPress={handleSignUp}
              disabled={!canCreate}
              loading={loading}
            />

            <Text style={[typography.bodySm, styles.legal]}>
              By continuing, you agree to our{" "}
              <Text
                style={styles.legalLink}
                onPress={() => Linking.openURL(TERMS_URL)}
              >
                Terms of Service
              </Text>{" "}
              and{" "}
              <Text
                style={styles.legalLink}
                onPress={() => Linking.openURL(PRIVACY_URL)}
              >
                Privacy Policy
              </Text>
              .
            </Text>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text
                style={[typography.labelSm, { color: colors.onSurfaceMuted }]}
              >
                or
              </Text>
              <View style={styles.dividerLine} />
            </View>

            <AppleSignInButton label="Sign up with Apple" />
            <GoogleSignInButton label="Sign up with Google" />
          </View>

          <Pressable
            onPress={() => router.push("/(auth)/sign-in")}
            style={styles.switchLink}
            hitSlop={12}
            accessibilityRole="button"
          >
            <Text
              style={[typography.bodyMd, { color: colors.onSurfaceVariant }]}
            >
              Already have an account?{" "}
              <Text style={styles.switchLinkEmphasis}>Sign in</Text>
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
  subtitleEmphasis: {
    color: colors.onSurface,
    fontFamily: "Figtree_600SemiBold",
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
  legal: {
    color: colors.onSurfaceVariant,
    textAlign: "center",
    paddingHorizontal: spacing.md,
  },
  legalLink: {
    color: colors.primary,
    fontFamily: "Figtree_600SemiBold",
    textDecorationLine: "underline",
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
  otpBlock: {
    marginBottom: spacing.xl,
  },
  errorInline: {
    color: colors.error,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  resendRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.xl,
  },
  resend: {
    color: colors.primary,
    fontFamily: "Figtree_600SemiBold",
  },
  resendDisabled: {
    color: colors.onSurfaceMuted,
  },
  editEmail: {
    alignItems: "center",
    marginTop: spacing.md,
  },
  editEmailLink: {
    color: colors.primary,
    fontFamily: "Figtree_600SemiBold",
  },
});
