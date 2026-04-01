import { View, StyleSheet, ViewStyle, ViewProps } from "react-native";
import { colors, spacing, radius } from "@/src/theme";

const LEVEL_COLORS = {
  0: colors.surface,
  1: colors.surfaceContainerLow,
  2: colors.surfaceContainerLowest,
} as const;

type Props = ViewProps & {
  level?: 0 | 1 | 2;
  style?: ViewStyle;
};

export function SurfaceCard({ level = 1, style, children, ...rest }: Props) {
  return (
    <View
      style={[styles.card, { backgroundColor: LEVEL_COLORS[level] }, style]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
});
