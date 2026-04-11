import { Pressable, Text, StyleSheet, ViewStyle, View } from "react-native";
import { colors, typography, spacing, radius } from "@/src/theme";

type Props = {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

export function GradientButton({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  style,
  accessibilityLabel,
}: Props) {
  const isDisabled = disabled || loading;

  if (variant === "outline") {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={[styles.base, styles.outline, isDisabled && styles.disabled, style]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
      >
        <Text style={[typography.titleLg, { color: colors.primary }]}>
          {title}
        </Text>
      </Pressable>
    );
  }

  if (variant === "ghost") {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={[styles.base, styles.ghost, isDisabled && styles.disabled, style]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
      >
        <Text style={[typography.titleLg, { color: colors.primary }]}>
          {title}
        </Text>
      </Pressable>
    );
  }

  const background =
    variant === "secondary" ? colors.secondary : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        styles.solid,
        { backgroundColor: background },
        isDisabled && styles.disabled,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      <View style={styles.row}>
        {loading ? <View style={styles.spinner} /> : null}
        <Text style={[typography.titleLg, { color: colors.onPrimary }]}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing["2xl"],
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  solid: {
    // solid fill — no gradient, no colored drop shadow
  },
  outline: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: "transparent",
  },
  ghost: {
    backgroundColor: "transparent",
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  spinner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.onPrimary,
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.45,
  },
});
