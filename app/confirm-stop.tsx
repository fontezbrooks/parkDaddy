import { useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { colors, typography, spacing, radius } from "@/src/theme";
import { GradientButton } from "@/src/components/GradientButton";

export default function ConfirmStopScreen() {
  const session = useQuery(api.sessions.getActive);
  const cancelSession = useMutation(api.sessions.cancel);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleStop = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      await cancelSession({ sessionId: session._id });
      router.dismissAll();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to stop parking session",
      );
      setLoading(false);
    }
  }, [session, cancelSession]);

  if (session === undefined) {
    return (
      <View style={styles.overlay}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const validUntil = session?.lastParkEnd
    ? new Date(session.lastParkEnd).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "its natural expiry";

  return (
    <View style={styles.overlay}>
      <View style={styles.modal}>
        <View style={styles.redStripe} />

        <View style={styles.content}>
          <Text style={styles.warningIcon}>⚠</Text>
          <Text style={[typography.headlineLg, { color: colors.onSurface }]}>
            Stop Parking?
          </Text>
          <Text
            style={[
              typography.bodyMd,
              { color: colors.onSurfaceVariant, textAlign: "center" },
            ]}
          >
            Are you sure you want to stop automated parking for{" "}
            <Text style={{ fontFamily: "Inter_600SemiBold" }}>
              {session?.plate}
            </Text>
            ? Future renewals will stop, but the current 2-hour registration
            remains valid until {validUntil}.
          </Text>

          {error ? (
            <Text style={[typography.bodySm, { color: colors.secondary }]}>
              {error}
            </Text>
          ) : null}

          <GradientButton
            title={loading ? "Stopping..." : "Stop Parking"}
            onPress={handleStop}
            disabled={loading || !session}
          />
          <Pressable onPress={() => router.back()}>
            <Text
              style={[
                typography.titleLg,
                { color: colors.onSurfaceVariant, textAlign: "center" },
              ]}
            >
              Cancel
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  modal: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  redStripe: {
    height: 4,
    backgroundColor: colors.secondary,
  },
  content: {
    padding: spacing["2xl"],
    alignItems: "center",
    gap: spacing.lg,
  },
  warningIcon: {
    fontSize: 40,
  },
});
