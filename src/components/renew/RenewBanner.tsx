import { useEffect } from "react";
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GradientButton } from "@/src/components/GradientButton";
import { colors, spacing, typography } from "@/src/theme";

type Props = {
  text: string;
  elapsedSeconds: number;
  showRetry: boolean;
  onRetry: () => void;
  onClose: () => void;
};

export function RenewBanner({
  text,
  elapsedSeconds,
  showRetry,
  onRetry,
  onClose,
}: Props) {
  useEffect(() => {
    // Android uses accessibilityLiveRegion on the Text instead.
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(text);
  }, [text]);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text
          style={styles.text}
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
        >
          {text}
        </Text>
        <Text
          style={styles.elapsed}
          accessibilityLabel={`${elapsedSeconds} seconds elapsed`}
        >
          {`${elapsedSeconds}s`}
        </Text>
      </View>
      <View style={styles.actions}>
        {showRetry ? (
          <GradientButton
            title="Retry"
            onPress={onRetry}
            style={styles.button}
          />
        ) : null}
        <GradientButton
          title="Close"
          variant="outline"
          onPress={onClose}
          style={styles.button}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  text: {
    ...typography.titleLg,
    color: colors.onSurface,
    flex: 1,
  },
  elapsed: {
    ...typography.titleMd,
    color: colors.onSurfaceVariant,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  button: {
    flex: 1,
  },
});
