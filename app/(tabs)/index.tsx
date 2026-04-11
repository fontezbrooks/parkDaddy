import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { router } from "expo-router";
import { colors, typography, spacing, radius } from "@/src/theme";
import { GradientButton } from "@/src/components/GradientButton";
import { StatusPill } from "@/src/components/StatusPill";
import { CountdownTimer } from "@/src/components/CountdownTimer";
import { SurfaceCard } from "@/src/components/SurfaceCard";
import { LinearGradient } from "expo-linear-gradient";

function Header() {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <View style={styles.logoIcon}>
          <Text style={styles.logoText}>P</Text>
        </View>
        <Text style={[typography.headlineSm, { color: colors.onSurface }]}>
          parkDaddy
        </Text>
      </View>
    </View>
  );
}

const DEFAULT_DURATION_MINUTES = 240; // 4 hours

function QuickStartCard({
  plate,
  onPark,
  loading,
}: {
  plate: string;
  onPark: () => void;
  loading: boolean;
}) {
  return (
    <LinearGradient
      colors={[colors.surfaceContainerLowest, colors.surfaceContainerLow]}
      style={styles.quickStartCard}
    >
      <View style={styles.quickStartInfo}>
        <Text style={[typography.headlineMd, { color: colors.primary }]}>
          {plate}
        </Text>
        <Text style={[typography.bodySm, { color: colors.onSurfaceVariant }]}>
          Park for 4 hours
        </Text>
      </View>
      <GradientButton
        title={loading ? "Parking..." : "Park Now"}
        onPress={onPark}
        disabled={loading}
      />
    </LinearGradient>
  );
}

function InactiveState() {
  const vehicles = useQuery(api.vehicles.list) ?? [];
  const createSession = useMutation(api.sessions.create);
  const [loadingPlate, setLoadingPlate] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleQuickStart = async (plate: string) => {
    setLoadingPlate(plate);
    setError("");
    try {
      await createSession({
        plate,
        durationMinutes: DEFAULT_DURATION_MINUTES,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start session");
    } finally {
      setLoadingPlate(null);
    }
  };

  if (vehicles.length === 0) {
    return (
      <View style={styles.content}>
        <View style={styles.emptyState}>
          <Text style={[typography.headlineLg, { color: colors.onSurface }]}>
            Park a guest
          </Text>
          <Text style={[typography.bodyMd, { color: colors.onSurfaceVariant }]}>
            Add a vehicle and we'll handle the rest. Auto-renewing,
            auto-everything.
          </Text>
        </View>
        <GradientButton
          title="Start Parking"
          onPress={() => router.push("/start-parking")}
        />
      </View>
    );
  }

  return (
    <View style={styles.content}>
      {error ? (
        <Text style={[typography.bodySm, { color: colors.secondary }]}>
          {error}
        </Text>
      ) : null}

      {vehicles.slice(0, 3).map((vehicle) => (
        <QuickStartCard
          key={vehicle._id}
          plate={vehicle.plate}
          loading={loadingPlate === vehicle.plate}
          onPark={() => handleQuickStart(vehicle.plate)}
        />
      ))}

      <GradientButton
        title="Park a different car"
        variant="outline"
        onPress={() => router.push("/start-parking")}
      />
    </View>
  );
}

function ActiveState({
  session,
}: {
  session: NonNullable<
    ReturnType<typeof useQuery<typeof api.sessions.getActive>>
  >;
}) {
  const endTimeFormatted = new Date(session.desiredEndTime).toLocaleTimeString(
    [],
    { hour: "2-digit", minute: "2-digit" },
  );

  return (
    <View style={styles.content}>
      <StatusPill status="active" />

      <LinearGradient
        colors={[colors.primary, colors.primaryContainer]}
        style={styles.heroCard}
      >
        <Text
          style={[typography.headlineSm, { color: "rgba(255,255,255,0.7)" }]}
        >
          You're covered until
        </Text>
        <Text style={[typography.displayLg, { color: colors.onPrimary }]}>
          {endTimeFormatted}
        </Text>
        <CountdownTimer targetTime={session.desiredEndTime} variant="medium" />
        <View style={styles.glassPill}>
          <Text style={[typography.bodySm, { color: colors.onSurface }]}>
            {session.plate} · Ponce Springs
          </Text>
        </View>
      </LinearGradient>

      <GradientButton
        title="Extend Time"
        onPress={() => router.push("/extend-duration")}
      />
      <GradientButton
        title="Stop Parking"
        variant="outline"
        onPress={() => router.push("/confirm-stop")}
      />
    </View>
  );
}

function ErrorState({
  session,
}: {
  session: NonNullable<
    ReturnType<typeof useQuery<typeof api.sessions.getActive>>
  >;
}) {
  const retryMutation = useMutation(api.sessions.retry);

  const validUntil = session.lastParkEnd
    ? new Date(session.lastParkEnd).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <View style={styles.content}>
      <SurfaceCard level={2}>
        <Text style={[typography.headlineMd, { color: colors.secondary }]}>
          Heads up — renewal didn't go through
        </Text>
        <Text style={[typography.bodyMd, { color: colors.onSurfaceVariant }]}>
          {validUntil
            ? `Your current registration for ${session.plate} is valid until ${validUntil}. Register manually to stay covered.`
            : `We couldn't renew parking for ${session.plate}. Register manually to stay covered.`}
        </Text>
      </SurfaceCard>

      <GradientButton
        title="Register at ParkEaz"
        onPress={() => Linking.openURL("https://paid.parkeaz.com")}
      />

      <Pressable
        onPress={() => retryMutation({ sessionId: session._id })}
        style={styles.manualLink}
      >
        <Text style={[typography.bodyMd, { color: colors.primary }]}>
          Retry automatic renewal
        </Text>
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const session = useQuery(api.sessions.getActive);

  return (
    <SafeAreaView style={styles.container}>
      <Header />
      {session === undefined ? (
        <View style={styles.loading}>
          <Text style={[typography.bodyMd, { color: colors.onSurfaceVariant }]}>
            Loading...
          </Text>
        </View>
      ) : session === null ? (
        <InactiveState />
      ) : session.status === "failed" ? (
        <ErrorState session={session} />
      ) : (
        <ActiveState session={session} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  logoIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    paddingVertical: spacing["3xl"],
    gap: spacing.md,
  },
  heroCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: "center",
  },
  glassPill: {
    backgroundColor: colors.glass,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  manualLink: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  quickStartCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  quickStartInfo: {
    gap: spacing.xs,
  },
});
