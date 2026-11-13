import { useEffect } from "react";
import {
  AccessibilityInfo,
  View,
  Text,
  StyleSheet,
  Pressable,
} from "react-native";
import { colors, typography, spacing } from "@/src/theme";
import { GradientButton } from "@/src/components/GradientButton";
import { OtpInput } from "@/src/components/OtpInput";
import type { SecondFactorStrategy } from "@/src/utils/signInOutcome";

const CODE_LENGTH = 6;

interface SignInCodeStepProps {
  strategy: SecondFactorStrategy;
  destination?: string;
  code: string;
  codeError: string;
  formError: string;
  loading: boolean;
  resendCooldown: number;
  onChangeCode: (value: string) => void;
  onVerify: (code?: string) => void;
  onResend: () => void;
  onBack: () => void;
}

function describeStrategy(
  strategy: SecondFactorStrategy,
  destination?: string,
): { title: string; subtitle: string } {
  if (strategy === "totp") {
    return {
      title: "Enter your authenticator code.",
      subtitle: "Open your authenticator app and type the 6-digit code.",
    };
  }
  const via = strategy === "phone_code" ? "a text" : "an email";
  const where = destination ? ` to ${destination}` : "";
  return {
    title: "One more step.",
    subtitle: `We sent ${via} with a 6-digit code${where}.`,
  };
}

export function SignInCodeStep({
  strategy,
  destination,
  code,
  codeError,
  formError,
  loading,
  resendCooldown,
  onChangeCode,
  onVerify,
  onResend,
  onBack,
}: SignInCodeStepProps) {
  const { title, subtitle } = describeStrategy(strategy, destination);
  const canResend = strategy !== "totp";

  // accessibilityLiveRegion is Android-only; announce for VoiceOver too.
  useEffect(() => {
    const message = codeError || formError;
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [codeError, formError]);

  return (
    <View>
      <Pressable
        onPress={onBack}
        style={styles.backButton}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Back to sign in"
      >
        <Text style={[typography.titleLg, styles.backLabel]}>← Back</Text>
      </Pressable>

      <Text style={[typography.displaySm, styles.title]}>{title}</Text>
      <Text style={[typography.bodyLg, styles.subtitle]}>{subtitle}</Text>

      <View style={styles.otpBlock}>
        <OtpInput
          length={CODE_LENGTH}
          value={code}
          onChange={onChangeCode}
          onComplete={(v) => onVerify(v)}
          error={Boolean(codeError)}
          autoFocus
        />
        {codeError ? (
          <Text
            style={[typography.bodySm, styles.errorInline]}
            accessibilityLiveRegion="polite"
          >
            {codeError}
          </Text>
        ) : null}
      </View>

      {formError ? (
        <View style={styles.formErrorBox} accessibilityLiveRegion="polite">
          <Text style={[typography.bodySm, styles.formErrorText]}>
            {formError}
          </Text>
        </View>
      ) : null}

      <GradientButton
        title={loading ? "Verifying…" : "Verify"}
        onPress={() => onVerify()}
        disabled={code.length < CODE_LENGTH || loading}
        loading={loading}
      />

      {canResend ? (
        <View style={styles.resendRow}>
          <Text style={[typography.bodyMd, { color: colors.onSurfaceVariant }]}>
            No code?{" "}
          </Text>
          <Pressable
            onPress={onResend}
            disabled={resendCooldown > 0}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityState={{ disabled: resendCooldown > 0 }}
          >
            <Text
              style={[
                typography.bodyMd,
                resendCooldown > 0 ? styles.resendDisabled : styles.resend,
              ]}
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  otpBlock: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  errorInline: {
    color: colors.error,
  },
  formErrorBox: {
    backgroundColor: colors.errorContainer,
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.lg,
  },
  formErrorText: {
    color: colors.error,
  },
  resendRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  resend: {
    color: colors.primary,
  },
  resendDisabled: {
    color: colors.onSurfaceMuted,
  },
});
