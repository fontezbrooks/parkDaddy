import { Pressable, Text, StyleSheet, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, typography, spacing, radius } from "@/src/theme";

type Props = {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline";
  disabled?: boolean;
  style?: ViewStyle;
};

export function GradientButton({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  style,
}: Props) {
  if (variant === "outline") {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={[styles.outline, disabled && styles.disabled, style]}
      >
        <Text style={[typography.titleLg, { color: colors.primary }]}>
          {title}
        </Text>
      </Pressable>
    );
  }

  const gradientColors =
    variant === "secondary"
      ? [colors.secondary, "#8b1016"] as const
      : [colors.primary, colors.primaryContainer] as const;

  return (
    <Pressable onPress={onPress} disabled={disabled} style={style}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, disabled && styles.disabled]}
      >
        <Text style={[typography.titleLg, { color: colors.onPrimary }]}>
          {title}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gradient: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing["2xl"],
    borderRadius: radius.lg,
    alignItems: "center",
    shadowColor: colors.ctaShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 4,
  },
  outline: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing["2xl"],
    borderRadius: radius.lg,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  disabled: {
    opacity: 0.5,
  },
});
