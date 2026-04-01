import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { colors, typography, spacing } from "@/src/theme";
import { GradientButton } from "@/src/components/GradientButton";
import { SurfaceCard } from "@/src/components/SurfaceCard";

export default function ReviewSessionScreen() {
  const params = useLocalSearchParams<{
    plate: string;
    makeModel?: string;
    color?: string;
    durationMinutes: string;
  }>();

  const createSession = useMutation(api.sessions.create);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const durationMinutes = parseInt(params.durationMinutes ?? "", 10);
  const isValid =
    !isNaN(durationMinutes) && durationMinutes >= 1 && durationMinutes <= 1440;
  const durationHours = Math.round((durationMinutes / 60) * 10) / 10;
  const renewalCount = isValid ? Math.ceil(durationMinutes / 120) : 0;
  const estimatedEnd = isValid
    ? new Date(Date.now() + durationMinutes * 60 * 1000)
    : null;

  const handleConfirm = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      await createSession({
        plate: params.plate,
        makeModel: params.makeModel || undefined,
        color: params.color || undefined,
        durationMinutes,
      });
      router.dismissAll();
      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err.message ?? "Failed to start session");
    } finally {
      setLoading(false);
    }
  }, [createSession, params, durationMinutes]);

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.plateHero}>
          <Text
            style={[typography.labelSm, { color: colors.onSurfaceVariant }]}
          >
            CONFIRMED VEHICLE
          </Text>
          <Text style={[typography.displaySm, { color: colors.primary }]}>
            {params.plate}
          </Text>
        </View>

        <View style={styles.detailsRow}>
          <SurfaceCard level={1} style={styles.detailCard}>
            <Text
              style={[typography.labelSm, { color: colors.onSurfaceVariant }]}
            >
              DURATION
            </Text>
            <Text style={[typography.headlineMd, { color: colors.onSurface }]}>
              {durationHours} hours
            </Text>
          </SurfaceCard>
          <SurfaceCard level={1} style={styles.detailCard}>
            <Text
              style={[typography.labelSm, { color: colors.onSurfaceVariant }]}
            >
              ENDS AT
            </Text>
            <Text style={[typography.headlineMd, { color: colors.onSurface }]}>
              {estimatedEnd
                ? estimatedEnd.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "--:--"}
            </Text>
          </SurfaceCard>
        </View>

        <View style={styles.detailsRow}>
          <SurfaceCard level={1} style={styles.detailCard}>
            <Text
              style={[typography.labelSm, { color: colors.onSurfaceVariant }]}
            >
              ZONE
            </Text>
            <Text style={[typography.headlineMd, { color: colors.onSurface }]}>
              622
            </Text>
          </SurfaceCard>
          <SurfaceCard level={1} style={styles.detailCard}>
            <Text
              style={[typography.labelSm, { color: colors.onSurfaceVariant }]}
            >
              RENEWALS
            </Text>
            <Text style={[typography.headlineMd, { color: colors.onSurface }]}>
              {renewalCount} Count
            </Text>
          </SurfaceCard>
        </View>

        <SurfaceCard level={1}>
          <Text style={[typography.bodySm, { color: colors.onSurfaceVariant }]}>
            Parking will auto-renew every 2 hours until the selected time. You
            will be notified 15 minutes prior to each renewal.
          </Text>
        </SurfaceCard>

        {error ? (
          <Text style={[typography.bodySm, { color: colors.secondary }]}>
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <GradientButton
          title={loading ? "Starting..." : "Confirm & Start Session"}
          onPress={handleConfirm}
          disabled={loading || !isValid}
        />
        <GradientButton
          title="Change Duration"
          variant="outline"
          onPress={() => router.back()}
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
  plateHero: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  detailsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  detailCard: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
});
