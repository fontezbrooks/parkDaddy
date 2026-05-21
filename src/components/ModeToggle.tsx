import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, typography, spacing, radius } from "@/src/theme";

export type Mode = "daily" | "extended";

type Props = {
  mode: Mode;
  onChange: (mode: Mode) => void;
  disabled?: boolean;
};

const OPTIONS: { value: Mode; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "extended", label: "Extended Stay" },
];

export function ModeToggle({ mode, onChange, disabled }: Props) {
  return (
    <View
      style={[styles.container, disabled && styles.disabled]}
      accessibilityRole="radiogroup"
    >
      {OPTIONS.map((opt) => {
        const selected = opt.value === mode;
        return (
          <Pressable
            key={opt.value}
            onPress={() => !disabled && onChange(opt.value)}
            disabled={disabled}
            style={[styles.segment, selected && styles.segmentSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={`${opt.label} mode`}
          >
            <Text
              style={[
                typography.labelLg,
                styles.label,
                selected && styles.labelSelected,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  disabled: {
    opacity: 0.5,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentSelected: {
    backgroundColor: colors.surfaceContainerLowest,
  },
  label: {
    color: colors.onSurfaceVariant,
  },
  labelSelected: {
    color: colors.primary,
    fontFamily: "Figtree_600SemiBold",
  },
});
