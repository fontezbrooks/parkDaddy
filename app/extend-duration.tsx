import { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { colors, typography, spacing, radius } from "@/src/theme";
import { GradientButton } from "@/src/components/GradientButton";
import { DurationPresetGrid } from "@/src/components/DurationPresetGrid";
import { StatusPill } from "@/src/components/StatusPill";

const PRESETS = [
  { label: "2h", minutes: 120, subtitle: "Standard" },
  { label: "4h", minutes: 240, subtitle: "Recommended" },
  { label: "8h", minutes: 480, subtitle: "Full Day" },
  { label: "12h", minutes: 720, subtitle: "Overnight" },
  { label: "24h", minutes: 1440, subtitle: "Full Day+" },
];

export default function ExtendDurationScreen() {
  const session = useQuery(api.sessions.getActive);
  const extendSession = useMutation(api.sessions.extend);
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const newEndTime = useMemo(() => {
    if (!session || !selectedMinutes) return null;
    return new Date(session.desiredEndTime + selectedMinutes * 60 * 1000);
  }, [session, selectedMinutes]);

  const handleExtend = useCallback(async () => {
    if (!session || !selectedMinutes) return;
    setLoading(true);
    setError("");

    try {
      await extendSession({
        sessionId: session._id,
        additionalMinutes: selectedMinutes,
      });
      router.back();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to extend");
    } finally {
      setLoading(false);
    }
  }, [session, selectedMinutes, extendSession]);

  if (session === undefined) {
    return (
      <SafeAreaView
        style={[
          styles.container,
          { alignItems: "center", justifyContent: "center" },
        ]}
      >
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (session === null) {
    return (
      <SafeAreaView style={styles.container}>
        <Text
          style={[
            typography.bodyMd,
            { color: colors.onSurfaceVariant, padding: spacing.lg },
          ]}
        >
          No active session
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.vehicleSummary}>
          <View style={styles.vehicleHeader}>
            <Text style={[typography.headlineMd, { color: colors.primary }]}>
              {session.plate}
            </Text>
            <StatusPill status="active" />
          </View>
          <Text style={[typography.bodySm, { color: colors.onSurfaceVariant }]}>
            Currently covered until{" "}
            {new Date(session.desiredEndTime).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>

        <View style={styles.durationSection}>
          <Text style={[typography.titleLg, { color: colors.onSurface }]}>
            Add more time
          </Text>
          <DurationPresetGrid
            presets={PRESETS}
            selected={selectedMinutes}
            onSelect={setSelectedMinutes}
          />
        </View>

        {newEndTime && (
          <View style={styles.impact}>
            <Text
              style={[typography.bodySm, { color: colors.onSurfaceVariant }]}
            >
              COVERED UNTIL
            </Text>
            <Text style={[typography.displaySm, { color: colors.onSurface }]}>
              {newEndTime.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
            <Text
              style={[typography.bodySm, { color: colors.onSurfaceVariant }]}
            >
              We keep auto-renewing for you.
            </Text>
          </View>
        )}

        {error ? (
          <Text style={[typography.bodySm, { color: colors.secondary }]}>
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <GradientButton
          title={loading ? "Extending..." : "Confirm Extension"}
          onPress={handleExtend}
          disabled={loading || !selectedMinutes}
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
    gap: spacing["2xl"],
  },
  vehicleSummary: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  vehicleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  durationSection: {
    gap: spacing.md,
  },
  impact: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.xs,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
});
