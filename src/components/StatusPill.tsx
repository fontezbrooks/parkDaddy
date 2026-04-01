import { View, Text, StyleSheet } from "react-native";
import { colors, typography, spacing, radius } from "@/src/theme";

type SessionStatus = "active" | "renewing" | "failed";

const STATUS_CONFIG = {
  active: { bg: colors.tertiary, text: "#0a5c4e", label: "ACTIVE (REGISTERED)" },
  renewing: { bg: "#FFD60A", text: "#5c4a00", label: "RENEWING..." },
  failed: { bg: colors.secondary, text: colors.onSecondary, label: "RENEWAL FAILED" },
} as const;

type Props = {
  status: SessionStatus;
};

export function StatusPill({ status }: Props) {
  const config = STATUS_CONFIG[status];

  return (
    <View style={[styles.pill, { backgroundColor: config.bg }]}>
      <View style={[styles.dot, { backgroundColor: config.text }]} />
      <Text style={[typography.labelSm, { color: config.text }]}>
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    gap: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
