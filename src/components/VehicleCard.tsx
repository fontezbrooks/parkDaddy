import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors, typography, spacing, radius } from "@/src/theme";

type Props = {
  plate: string;
  makeModel?: string;
  onPress?: () => void;
};

export function VehicleCard({ plate, makeModel, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={styles.card} disabled={!onPress}>
      <View style={styles.plateContainer}>
        <Text style={[typography.headlineMd, { color: colors.primary }]}>
          {plate}
        </Text>
      </View>
      {makeModel && (
        <Text style={[typography.bodySm, { color: colors.onSurfaceVariant }]}>
          {makeModel}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  plateContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
});
