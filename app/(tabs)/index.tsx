import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { router } from "expo-router";
import { colors, typography, spacing, radius } from "@/src/theme";
import { GradientButton } from "@/src/components/GradientButton";
import { StatusPill } from "@/src/components/StatusPill";
import { CountdownTimer } from "@/src/components/CountdownTimer";
import { VehicleCard } from "@/src/components/VehicleCard";
import { SurfaceCard } from "@/src/components/SurfaceCard";
import { LinearGradient } from "expo-linear-gradient";

function Header() {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <View style={styles.logoIcon}>
          <Text style={styles.logoText}>P</Text>
        </View>
        <Text style={[typography.titleLg, { color: colors.onSurface }]}>
          parkDaddy
        </Text>
      </View>
    </View>
  );
}

function InactiveState() {
  const vehicles = useQuery(api.vehicles.list) ?? [];

  return (
    <View style={styles.content}>
      <View style={styles.emptyState}>
        <Text style={[typography.headlineMd, { color: colors.onSurface }]}>
          No active session. Your guests are not currently registered.
        </Text>
        <Text style={[typography.bodyMd, { color: colors.onSurfaceVariant }]}>
          Start a session to provide your guests with verified parking status
          and avoid enforcement risk.
        </Text>
      </View>

      <GradientButton
        title="START NEW PARKING SESSION"
        onPress={() => router.push("/start-parking")}
      />

      {vehicles.length > 0 && (
        <View style={styles.vehiclesSection}>
          <Text style={[typography.labelMd, styles.sectionLabel]}>
            SAVED VEHICLES
          </Text>
          {vehicles.map((item, i) => (
            <View key={item._id}>
              {i > 0 && <View style={{ height: spacing.sm }} />}
              <VehicleCard
                plate={item.plate}
                makeModel={item.makeModel}
                onPress={() =>
                  router.push({
                    pathname: "/start-parking",
                    params: { plate: item.plate },
                  })
                }
              />
            </View>
          ))}
        </View>
      )}
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
  const status = session.status as "active" | "renewing" | "failed";

  return (
    <View style={styles.content}>
      <StatusPill status={status} />

      <LinearGradient
        colors={[colors.primary, colors.primaryContainer]}
        style={styles.heroCard}
      >
        <Text style={[typography.labelSm, { color: "rgba(255,255,255,0.7)" }]}>
          TIME REMAINING
        </Text>
        <CountdownTimer targetTime={session.desiredEndTime} />
        {session.lastParkEnd && (
          <View style={styles.glassPill}>
            <Text style={[typography.bodySm, { color: colors.onSurface }]}>
              Session ends at{" "}
              {new Date(session.desiredEndTime).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
        )}
        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Text
              style={[typography.labelSm, { color: "rgba(255,255,255,0.7)" }]}
            >
              VEHICLE
            </Text>
            <Text style={[typography.titleLg, { color: colors.onPrimary }]}>
              {session.plate}
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Text
              style={[typography.labelSm, { color: "rgba(255,255,255,0.7)" }]}
            >
              ZONE
            </Text>
            <Text style={[typography.titleLg, { color: colors.onPrimary }]}>
              622
            </Text>
          </View>
        </View>
      </LinearGradient>

      {session.renewalLogs && session.renewalLogs.length > 0 && (
        <SurfaceCard level={1}>
          <Text
            style={[
              typography.labelMd,
              { color: colors.onSurfaceVariant, marginBottom: spacing.sm },
            ]}
          >
            RENEWAL LOG
          </Text>
          {session.renewalLogs
            .filter((l) => l.action === "renewal" || l.action === "initial")
            .slice(-3)
            .map((log) => (
              <View key={log._id} style={styles.logItem}>
                <Text style={[typography.bodySm, { color: colors.onSurface }]}>
                  {log.action === "initial" ? "Started" : "Renewed"} at{" "}
                  {new Date(log._creationTime).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            ))}
        </SurfaceCard>
      )}

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

  return (
    <View style={styles.content}>
      <View style={styles.alarmHeader}>
        <Text style={[typography.labelLg, { color: colors.onSecondary }]}>
          RENEWAL FAILED
        </Text>
      </View>

      {session.lastParkEnd && (
        <SurfaceCard level={2}>
          <Text
            style={[typography.labelSm, { color: colors.onSurfaceVariant }]}
          >
            REGISTRATION EXPIRES IN
          </Text>
          <CountdownTimer
            targetTime={session.lastParkEnd}
            variant="medium"
            style={{ color: colors.secondary }}
          />
        </SurfaceCard>
      )}

      <SurfaceCard level={1}>
        <Text style={[typography.titleLg, { color: colors.onSurface }]}>
          Connection Error
        </Text>
        <Text style={[typography.bodyMd, { color: colors.onSurfaceVariant }]}>
          {session.lastError ?? "Could not connect to the parking system."}
        </Text>
        <View style={styles.infoRow}>
          <Text style={[typography.bodySm, { color: colors.onSurfaceVariant }]}>
            {session.plate} · Zone 622
          </Text>
        </View>
      </SurfaceCard>

      <GradientButton
        title="Retry Now"
        variant="secondary"
        onPress={() => retryMutation({ sessionId: session._id })}
      />

      <Pressable
        onPress={() => Linking.openURL("https://paid.parkeaz.com")}
        style={styles.manualLink}
      >
        <Text style={[typography.bodyMd, { color: colors.primary }]}>
          Register Manually at ParkEaz
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
  vehiclesSection: {
    gap: spacing.sm,
  },
  sectionLabel: {
    color: colors.onSurfaceVariant,
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
  infoGrid: {
    flexDirection: "row",
    gap: spacing["3xl"],
    marginTop: spacing.sm,
  },
  infoItem: {
    alignItems: "center",
    gap: spacing.xs,
  },
  logItem: {
    paddingVertical: spacing.xs,
  },
  alarmHeader: {
    backgroundColor: colors.secondary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginHorizontal: -spacing.lg,
    alignItems: "center",
  },
  infoRow: {
    marginTop: spacing.sm,
  },
  manualLink: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
});
