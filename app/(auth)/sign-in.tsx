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
import * as Sentry from "@sentry/react-native";
import { colors, typography, spacing } from "@/src/theme";
import { GradientButton } from "@/src/components/GradientButton";
import { GoogleSignInButton } from "@/src/components/GoogleSignInButton";
import { AppleSignInButton } from "@/src/components/AppleSignInButton";
import { FormField, PasswordToggle } from "@/src/components/FormField";
import { SignInCodeStep } from "@/src/components/auth/SignInCodeStep";
import { mapClerkError } from "@/src/utils/clerkErrors";
import {
  resolveSignInOutcome,
  signInOutcomeMessage,
  type SecondFactorStrategy,
  type SignInOutcome,
} from "@/src/utils/signInOutcome";
import {
  biometricAvailableAsync,
  getLastEmail,
  promptBiometric,
  rememberLastEmail,
} from "@/src/utils/biometric";

const RESEND_COOLDOWN_SECS = 30;
const MIN_PASSWORD_LENGTH = 8;
const CODE_LENGTH = 6;

type Step =
  | { kind: "credentials" }
  | {
      kind: "second_factor";
      strategy: SecondFactorStrategy;
      destination?: string;
      emailAddressId?: string;
      phoneNumberId?: string;
    }
  | { kind: "new_password" };

type SecondFactorOutcome = Extract<SignInOutcome, { kind: "second_factor" }>;

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

  const [step, setStep] = useState<Step>({ kind: "credentials" });
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  const passwordRef = useRef<TextInput>(null);
  // OtpInput's onComplete and the Verify button can fire for the same code.
  const verifyInFlightRef = useRef(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => {
      setResendCooldown((n) => Math.max(0, n - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

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
    setCodeError("");
    setFormError("");
  };

  const finishSignIn = useCallback(
    async (sessionId: string) => {
      if (!isLoaded) return;
      await rememberLastEmail(email);
      await setActive({ session: sessionId });
      router.replace("/(tabs)");
    },
    [isLoaded, email, setActive],
  );

  const startSecondFactor = useCallback(
    async (outcome: SecondFactorOutcome) => {
      if (!isLoaded) return;
      if (outcome.strategy === "email_code") {
        await signIn.prepareSecondFactor({
          strategy: "email_code",
          emailAddressId: outcome.emailAddressId,
        });
      } else if (outcome.strategy === "phone_code") {
        await signIn.prepareSecondFactor({
          strategy: "phone_code",
          phoneNumberId: outcome.phoneNumberId,
        });
      }
      setCode("");
      setResendCooldown(outcome.strategy === "totp" ? 0 : RESEND_COOLDOWN_SECS);
      setStep({
        kind: "second_factor",
        strategy: outcome.strategy,
        destination: outcome.safeIdentifier,
        emailAddressId: outcome.emailAddressId,
        phoneNumberId: outcome.phoneNumberId,
      });
    },
    [isLoaded, signIn],
  );

  // Every Clerk status lands here. Nothing may fall through silently.
  const applyOutcome = useCallback(
    async (outcome: SignInOutcome) => {
      Sentry.addBreadcrumb({
        category: "auth",
        message: "sign_in_outcome",
        level: "info",
        data: { ...outcome },
      });
      switch (outcome.kind) {
        case "complete":
          await finishSignIn(outcome.sessionId);
          return;
        case "second_factor":
          await startSecondFactor(outcome);
          return;
        case "new_password":
          setNewPassword("");
          setStep({ kind: "new_password" });
          return;
        case "unsupported":
          Sentry.captureMessage("sign_in_unsupported_status", {
            level: "warning",
            extra: { status: outcome.status, reason: outcome.reason },
          });
          setFormError(signInOutcomeMessage(outcome));
          return;
      }
    },
    [finishSignIn, startSecondFactor],
  );

  const handleSignIn = useCallback(async () => {
    if (!isLoaded) return;
    setLoading(true);
    clearErrors();

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });
      await applyOutcome(resolveSignInOutcome(result));
    } catch (err: unknown) {
      const mapped = mapClerkError(err);
      setAttempts((n) => n + 1);
      if (mapped.field === "email") setEmailError(mapped.message);
      else if (mapped.field === "password") setPasswordError(mapped.message);
      else setFormError(mapped.message);
    } finally {
      setLoading(false);
    }
  }, [isLoaded, email, password, signIn, applyOutcome]);

  const handleVerifyCode = useCallback(
    async (submitted?: string) => {
      if (!isLoaded || step.kind !== "second_factor") return;
      if (verifyInFlightRef.current) return;
      const value = submitted ?? code;
      if (value.length < CODE_LENGTH) return;
      verifyInFlightRef.current = true;
      setLoading(true);
      clearErrors();

      try {
        const result = await signIn.attemptSecondFactor({
          strategy: step.strategy,
          code: value,
        });
        await applyOutcome(resolveSignInOutcome(result));
      } catch (err: unknown) {
        const mapped = mapClerkError(err);
        if (mapped.field === "code") setCodeError(mapped.message);
        else setFormError(mapped.message);
        setCode("");
      } finally {
        verifyInFlightRef.current = false;
        setLoading(false);
      }
    },
    [isLoaded, step, code, signIn, applyOutcome],
  );

  const handleResendCode = useCallback(async () => {
    if (!isLoaded || step.kind !== "second_factor" || resendCooldown > 0) {
      return;
    }
    if (step.strategy === "totp") return;
    clearErrors();
    try {
      if (step.strategy === "email_code") {
        await signIn.prepareSecondFactor({
          strategy: "email_code",
          emailAddressId: step.emailAddressId,
        });
      } else {
        await signIn.prepareSecondFactor({
          strategy: "phone_code",
          phoneNumberId: step.phoneNumberId,
        });
      }
      setResendCooldown(RESEND_COOLDOWN_SECS);
    } catch (err: unknown) {
      setFormError(mapClerkError(err).message);
    }
  }, [isLoaded, step, resendCooldown, signIn]);

  const handleResetPassword = useCallback(async () => {
    // Keyboard "go" bypasses the button's disabled state; guard here too.
    if (!isLoaded || loading || newPassword.length < MIN_PASSWORD_LENGTH) {
      return;
    }
    setLoading(true);
    clearErrors();

    try {
      const result = await signIn.resetPassword({
        password: newPassword,
        signOutOfOtherSessions: true,
      });
      await applyOutcome(resolveSignInOutcome(result));
    } catch (err: unknown) {
      const mapped = mapClerkError(err);
      if (mapped.field === "password") setPasswordError(mapped.message);
      else setFormError(mapped.message);
    } finally {
      setLoading(false);
    }
  }, [isLoaded, loading, newPassword, signIn, applyOutcome]);

  const handleBackToCredentials = useCallback(() => {
    setStep({ kind: "credentials" });
    setCode("");
    setNewPassword("");
    clearErrors();
  }, []);

  const handleBiometricUnlock = useCallback(async () => {
    const ok = await promptBiometric("Sign in to parkDaddy");
    if (ok) {
      passwordRef.current?.focus();
    }
  }, []);

  const canSubmit =
    isLoaded && email.length > 0 && password.length > 0 && !loading;

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
          {step.kind === "second_factor" ? (
            <SignInCodeStep
              strategy={step.strategy}
              destination={step.destination}
              code={code}
              codeError={codeError}
              formError={formError}
              loading={loading}
              resendCooldown={resendCooldown}
              onChangeCode={(v) => {
                setCode(v);
                if (codeError) setCodeError("");
              }}
              onVerify={handleVerifyCode}
              onResend={handleResendCode}
              onBack={handleBackToCredentials}
            />
          ) : null}

          {step.kind === "new_password" ? (
            <>
              <Pressable
                onPress={handleBackToCredentials}
                style={styles.backButton}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Back to sign in"
              >
                <Text style={[typography.titleLg, styles.backLabel]}>
                  ← Back
                </Text>
              </Pressable>

              <Text style={[typography.displaySm, styles.title]}>
                Pick a new password.
              </Text>
              <Text style={[typography.bodyLg, styles.subtitle]}>
                Your current password can&apos;t be used anymore. Choose a new
                one to finish signing in.
              </Text>

              <View style={styles.form}>
                <FormField
                  label="New password"
                  value={newPassword}
                  onChangeText={(v) => {
                    setNewPassword(v);
                    if (passwordError) setPasswordError("");
                  }}
                  error={passwordError}
                  secureTextEntry={!showPassword}
                  textContentType="newPassword"
                  autoComplete="new-password"
                  returnKeyType="go"
                  onSubmitEditing={handleResetPassword}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
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
                  title={loading ? "Saving…" : "Save and sign in"}
                  onPress={handleResetPassword}
                  disabled={newPassword.length < MIN_PASSWORD_LENGTH || loading}
                  loading={loading}
                />
              </View>
            </>
          ) : null}

          {step.kind === "credentials" ? (
            <>
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
                    style={[
                      typography.labelSm,
                      { color: colors.onSurfaceMuted },
                    ]}
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
                <Text
                  style={[
                    typography.bodyMd,
                    { color: colors.onSurfaceVariant },
                  ]}
                >
                  New here?{" "}
                  <Text style={styles.switchLinkEmphasis}>
                    Create an account
                  </Text>
                </Text>
              </Pressable>
            </>
          ) : null}
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
