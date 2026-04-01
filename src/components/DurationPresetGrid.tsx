import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors, typography, spacing, radius } from "@/src/theme";

type Preset = {
  label: string;
  minutes: number;
  subtitle?: string;
};

type Props = {
  presets: Preset[];
  selected: number | null;
  onSelect: (minutes: number) => void;
};

export function DurationPresetGrid({ presets, selected, onSelect }: Props) {
  return (
    <View style={styles.grid}>
      {presets.map((preset) => {
        const isSelected = selected === preset.minutes;
        return (
          <Pressable
            key={preset.minutes}
            onPress={() => onSelect(preset.minutes)}
            style={[styles.preset, isSelected && styles.presetSelected]}
          >
            <Text
              style={[
                typography.headlineMd,
                { color: isSelected ? colors.onPrimary : colors.onSurface },
              ]}
            >
              {preset.label}
            </Text>
            {preset.subtitle && (
              <Text
                style={[
                  typography.bodySm,
                  {
                    color: isSelected
                      ? "rgba(255,255,255,0.7)"
                      : colors.onSurfaceVariant,
                  },
                ]}
              >
                {preset.subtitle}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  preset: {
    width: "31%",
    flexGrow: 1,
    aspectRatio: 1.4,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
  },
  presetSelected: {
    backgroundColor: colors.primary,
    shadowColor: colors.ctaShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
});
