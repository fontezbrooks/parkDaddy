import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { colors, typography, spacing, radius } from "@/src/theme";
import { GradientButton } from "@/src/components/GradientButton";
import { StatusPill } from "@/src/components/StatusPill";

const DAILY_EXTENSION_MS = 24 * 60 * 60 * 1000;

export default function ExtendDurationScreen() {
  const params = useLocalSearchParams<{ autoExtend?: string }>();
  const session = useQuery(api.sessions.getActive);
  const extendSession = useMutation(api.sessions.extend);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const autoExtendFiredRef = useRef(false);

  const newEndTime = useMemo(() => {
    if (!session) return null;
    return new Date(session.desiredEndTime + DAILY_EXTENSION_MS);
  }, [session]);

  const handleExtend = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      await extendSession({ sessionId: session._id });
      router.back();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to extend");
    } finally {
      setLoading(false);
    }
  }, [session, extendSession]);

  // Notification-action path: if /extend-duration?autoExtend=1, fire the
  // extend mutation as soon as we have a session and route home on success.
  // Guarded with a ref so re-renders don't trigger a second extend.
  useEffect(() => {
    if (autoExtendFiredRef.current) return;
    if (params.autoExtend !== "1") return;
    if (!session) return;
    if ((session.mode ?? "daily") === "extended") return;
    autoExtendFiredRef.current = true;
    handleExtend();
  }, [params.autoExtend, session, handleExtend]);

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

  // Extended Stay sessions auto-renew indefinitely — nothing to extend.
  // Bounce back to home rather than show a broken-looking extend screen.
  if ((session.mode ?? "daily") === "extended") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={[typography.headlineMd, { color: colors.primary }]}>
            Already auto-renewing
          </Text>
          <Text
            style={[
              typography.bodyMd,
              { color: colors.onSurfaceVariant, textAlign: "center" },
            ]}
          >
            Extended Stay keeps your car parked until you turn it off — no
            extension needed.
          </Text>
          <GradientButton title="Back to home" onPress={() => router.back()} />
        </View>
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

        {newEndTime && (
          <View style={styles.impact}>
            <Text
              style={[typography.bodySm, { color: colors.onSurfaceVariant }]}
            >
              EXTEND COVERAGE UNTIL
            </Text>
            <Text style={[typography.displaySm, { color: colors.onSurface }]}>
              {newEndTime.toLocaleString([], {
                weekday: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
            <Text
              style={[typography.bodySm, { color: colors.onSurfaceVariant }]}
            >
              We'll auto-renew for another 24 hours.
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
          title={loading ? "Extending..." : "Extend 24 hours"}
          onPress={handleExtend}
          disabled={loading}
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
  impact: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.xs,
  },
  emptyState: {
    flex: 1,
    paddingHorizontal: spacing["2xl"],
    paddingVertical: spacing["3xl"],
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
});
