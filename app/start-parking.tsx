import { useState, useMemo } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { colors, typography, spacing, radius } from "@/src/theme";
import { GradientButton } from "@/src/components/GradientButton";
import { DurationPresetGrid } from "@/src/components/DurationPresetGrid";

function getOvernightMinutes(): number {
  const now = new Date();
  const tomorrow8am = new Date(now);
  tomorrow8am.setDate(tomorrow8am.getDate() + 1);
  tomorrow8am.setHours(8, 0, 0, 0);
  return Math.max(120, Math.round((tomorrow8am.getTime() - now.getTime()) / 60000));
}

const PRESETS = [
  { label: "2h", minutes: 120 },
  { label: "4h", minutes: 240 },
  { label: "8h", minutes: 480, subtitle: "Full Day" },
  { label: "12h", minutes: 720, subtitle: "Overnight" },
  { label: "24h", minutes: 1440, subtitle: "Full Day+" },
  { label: "Night", minutes: -1, subtitle: "Until 8 AM" },
];

export default function StartParkingScreen() {
  const params = useLocalSearchParams<{ plate?: string }>();
  const [plate, setPlate] = useState(params.plate ?? "");
  const [makeModel, setMakeModel] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null);

  const actualMinutes = useMemo(() => {
    if (selectedMinutes === -1) return getOvernightMinutes();
    return selectedMinutes;
  }, [selectedMinutes]);

  const estimatedEnd = useMemo(() => {
    if (!actualMinutes) return null;
    return new Date(Date.now() + actualMinutes * 60 * 1000);
  }, [actualMinutes]);

  const renewalCount = useMemo(() => {
    if (!actualMinutes) return 0;
    return Math.ceil(actualMinutes / 120);
  }, [actualMinutes]);

  const canProceed = plate.length >= 2 && selectedMinutes !== null;

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={[typography.labelMd, styles.sectionLabel]}>
          VEHICLE IDENTITY
        </Text>
        <Text style={[typography.headlineLg, { color: colors.onSurface }]}>
          Start Parking
        </Text>

        <View style={styles.plateSection}>
          <Text style={[typography.labelSm, styles.fieldLabel]}>
            LICENSE PLATE NUMBER
          </Text>
          <TextInput
            style={styles.plateInput}
            value={plate}
            onChangeText={(t) => setPlate(t.toUpperCase())}
            placeholder="ABC-1234"
            placeholderTextColor={colors.onSurfaceVariant}
            autoCapitalize="characters"
            maxLength={10}
          />
        </View>

        <View style={styles.optionalRow}>
          <View style={styles.optionalField}>
            <Text style={[typography.labelSm, styles.fieldLabel]}>
              MAKE & MODEL
            </Text>
            <TextInput
              style={styles.input}
              value={makeModel}
              onChangeText={setMakeModel}
              placeholder="e.g. Tesla Model 3"
              placeholderTextColor={colors.onSurfaceVariant}
            />
          </View>
          <View style={styles.optionalField}>
            <Text style={[typography.labelSm, styles.fieldLabel]}>
              VEHICLE COLOR
            </Text>
            <TextInput
              style={styles.input}
              value={vehicleColor}
              onChangeText={setVehicleColor}
              placeholder="e.g. Silver"
              placeholderTextColor={colors.onSurfaceVariant}
            />
          </View>
        </View>

        <View style={styles.durationSection}>
          <Text style={[typography.titleLg, { color: colors.onSurface }]}>
            How long?
          </Text>
          <DurationPresetGrid
            presets={PRESETS}
            selected={selectedMinutes}
            onSelect={setSelectedMinutes}
          />
        </View>

        {estimatedEnd && (
          <View style={styles.summary}>
            <Text style={[typography.labelSm, styles.fieldLabel]}>
              ESTIMATED END TIME
            </Text>
            <Text style={[typography.displaySm, { color: colors.onSurface }]}>
              {estimatedEnd.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              <Text style={[typography.bodyMd, { color: colors.onSurfaceVariant }]}>
                {" "}
                ({estimatedEnd.toLocaleDateString([], { weekday: "short" })})
              </Text>
            </Text>
            <Text style={[typography.bodySm, { color: colors.onSurfaceVariant }]}>
              {renewalCount} renewal{renewalCount !== 1 ? "s" : ""} included
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <GradientButton
          title="Confirm & Start"
          onPress={() =>
            router.push({
              pathname: "/review-session",
              params: {
                plate,
                makeModel,
                color: vehicleColor,
                durationMinutes: String(actualMinutes),
              },
            })
          }
          disabled={!canProceed}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  sectionLabel: {
    color: colors.onSurfaceVariant,
  },
  fieldLabel: {
    color: colors.onSurfaceVariant,
    marginBottom: spacing.xs,
  },
  plateSection: {
    marginTop: spacing.sm,
  },
  plateInput: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: colors.primary,
    textAlign: "center",
    letterSpacing: 2,
  },
  optionalRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  optionalField: {
    flex: 1,
  },
  input: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: colors.onSurface,
  },
  durationSection: {
    gap: spacing.md,
  },
  summary: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
});
