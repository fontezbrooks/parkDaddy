import { useCallback, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { colors, typography, spacing, radius } from "@/src/theme";
import { GradientButton } from "@/src/components/GradientButton";

export default function StartParkingScreen() {
  const params = useLocalSearchParams<{ plate?: string }>();
  const [plate, setPlate] = useState(params.plate ?? "");
  const [makeModel, setMakeModel] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [showVehicleDetails, setShowVehicleDetails] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const createSession = useMutation(api.sessions.create);

  const canProceed = plate.length >= 2;

  const handleParkThisCar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const sessionId = await createSession({
        plate,
        makeModel: makeModel || undefined,
        color: vehicleColor || undefined,
      });
      router.dismissAll();
      router.replace({ pathname: "/renew", params: { sessionId } });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start session");
    } finally {
      setLoading(false);
    }
  }, [createSession, plate, makeModel, vehicleColor]);

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={[typography.headlineLg, { color: colors.onSurface }]}>
          Park a guest
        </Text>

        <View>
          <Text style={[typography.labelSm, styles.fieldLabel]}>
            LICENSE PLATE
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

        <Pressable
          onPress={() => setShowVehicleDetails((v) => !v)}
          style={styles.accordionTrigger}
        >
          <Text style={[typography.bodyMd, { color: colors.primary }]}>
            {showVehicleDetails
              ? "Hide vehicle details"
              : "Add vehicle details (optional)"}
          </Text>
        </Pressable>

        {showVehicleDetails && (
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
              <Text style={[typography.labelSm, styles.fieldLabel]}>COLOR</Text>
              <TextInput
                style={styles.input}
                value={vehicleColor}
                onChangeText={setVehicleColor}
                placeholder="e.g. Silver"
                placeholderTextColor={colors.onSurfaceVariant}
              />
            </View>
          </View>
        )}

        <View style={styles.summary}>
          <Text style={[typography.displaySm, { color: colors.onSurface }]}>
            Covered for 24 hours, one tap at a time.
          </Text>
          <Text style={[typography.bodySm, { color: colors.onSurfaceVariant }]}>
            ParkEaz needs a human check every 2 hours. We&apos;ll ping you 10
            minutes before each window ends.
          </Text>
        </View>

        {error ? (
          <Text style={[typography.bodySm, { color: colors.secondary }]}>
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <GradientButton
          title={loading ? "Parking..." : "Park This Car"}
          onPress={handleParkThisCar}
          disabled={!canProceed || loading}
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
  fieldLabel: {
    color: colors.onSurfaceVariant,
    marginBottom: spacing.xs,
  },
  accordionTrigger: {
    paddingVertical: spacing.sm,
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
