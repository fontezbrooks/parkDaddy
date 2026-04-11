import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Linking,
  AccessibilityInfo,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { router } from "expo-router";
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  withRepeat,
  withSequence,
  interpolate,
} from "react-native-reanimated";
import * as Sentry from "@sentry/react-native";
import { colors, typography, spacing, radius } from "@/src/theme";
import { CountdownTimer } from "@/src/components/CountdownTimer";
import { mapConvexError } from "@/src/utils/convexErrors";

const DEFAULT_DURATION_MINUTES = 240; // 4 hours
const EASE_OUT_QUART = Easing.bezier(0.25, 1, 0.5, 1);

type ActiveSession = NonNullable<
  ReturnType<typeof useQuery<typeof api.sessions.getActive>>
>;

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─────────────────────────────────────────────────────────────
// Skeleton loading
// ─────────────────────────────────────────────────────────────

function LoadingState() {
  const pulse = useSharedValue(0.4);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.4, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <View style={styles.loading}>
      <Animated.Text style={[typography.bodyLg, styles.loadingText, style]}>
        Checking on your guest…
      </Animated.Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Active state — full-bleed hero
// ─────────────────────────────────────────────────────────────

function ActiveState({ session }: { session: ActiveSession }) {
  const [retrying, setRetrying] = useState(false);

  const endTimeFormatted = new Date(session.desiredEndTime).toLocaleTimeString(
    [],
    { hour: "2-digit", minute: "2-digit" },
  );

  const kicker = useSharedValue(0);
  const label = useSharedValue(0);
  const countdown = useSharedValue(0);
  const plate = useSharedValue(0);
  const actions = useSharedValue(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((r) => {
      const d = r ? 0 : 1;
      const base = r ? 120 : 520;
      kicker.value = withDelay(
        80 * d,
        withTiming(1, { duration: base, easing: EASE_OUT_QUART }),
      );
      label.value = withDelay(
        180 * d,
        withTiming(1, { duration: base, easing: EASE_OUT_QUART }),
      );
      countdown.value = withDelay(
        320 * d,
        withTiming(1, { duration: base + 120, easing: EASE_OUT_QUART }),
      );
      plate.value = withDelay(
        500 * d,
        withTiming(1, { duration: base, easing: EASE_OUT_QUART }),
      );
      actions.value = withDelay(
        640 * d,
        withTiming(1, { duration: base, easing: EASE_OUT_QUART }),
      );
    });
  }, [kicker, label, countdown, plate, actions]);

  const kickerStyle = useAnimatedStyle(() => ({
    opacity: kicker.value,
    transform: [{ translateY: interpolate(kicker.value, [0, 1], [10, 0]) }],
  }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: label.value,
    transform: [{ translateY: interpolate(label.value, [0, 1], [16, 0]) }],
  }));
  const countdownStyle = useAnimatedStyle(() => ({
    opacity: countdown.value,
    transform: [
      { translateY: interpolate(countdown.value, [0, 1], [24, 0]) },
      { scale: interpolate(countdown.value, [0, 1], [0.96, 1]) },
    ],
  }));
  const plateStyle = useAnimatedStyle(() => ({
    opacity: plate.value,
    transform: [{ translateY: interpolate(plate.value, [0, 1], [16, 0]) }],
  }));
  const actionsStyle = useAnimatedStyle(() => ({
    opacity: actions.value,
    transform: [{ translateY: interpolate(actions.value, [0, 1], [20, 0]) }],
  }));

  const isFailed = session.status === "failed";
  const isRenewing = session.status === "renewing";

  const validUntil = session.lastParkEnd
    ? new Date(session.lastParkEnd).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const retryMutation = useMutation(api.sessions.retry);
  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try {
      await retryMutation({ sessionId: session._id });
    } catch (err) {
      Sentry.captureException(
        err instanceof Error ? err : new Error("Retry failed"),
      );
    } finally {
      setRetrying(false);
    }
  }, [retryMutation, session._id]);

  if (isFailed) {
    return (
      <View style={styles.heroBlock}>
        <Animated.Text
          style={[typography.labelSm, styles.kickerError, kickerStyle]}
        >
          Heads up
        </Animated.Text>
        <Animated.Text
          style={[typography.displayMd, styles.failedTitle, labelStyle]}
        >
          Renewal didn't take.
        </Animated.Text>
        <Animated.Text
          style={[typography.bodyLg, styles.failedBody, countdownStyle]}
        >
          {validUntil
            ? `${session.plate} is covered until ${validUntil}. Register manually to stay covered.`
            : `We couldn't renew ${session.plate}. Register manually to stay covered.`}
        </Animated.Text>

        <Animated.View style={[styles.actions, actionsStyle]}>
          <Pressable
            onPress={() => Linking.openURL("https://paid.parkeaz.com")}
            style={({ pressed }) => [
              styles.primaryCta,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Open ParkEaz"
          >
            <Text style={[typography.titleLg, styles.primaryCtaLabel]}>
              Open ParkEaz
            </Text>
            <Text style={styles.primaryCtaArrow}></Text>
          </Pressable>

          <Pressable
            onPress={handleRetry}
            disabled={retrying}
            hitSlop={12}
            style={styles.retryLink}
            accessibilityRole="button"
            accessibilityLabel="Try automatic renewal again"
          >
            <Text
              style={[
                typography.bodyMd,
                retrying ? styles.retryDisabled : styles.retryLabel,
              ]}
            >
              {retrying ? "Trying again…" : "Try again"}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.heroBlock}>
      <Animated.Text style={[typography.labelSm, styles.kicker, kickerStyle]}>
        {isRenewing ? "Renewing" : "Covered until"}
      </Animated.Text>
      <Animated.Text style={[typography.displayMd, styles.endTime, labelStyle]}>
        {endTimeFormatted}
      </Animated.Text>

      <Animated.View style={[styles.countdownBlock, countdownStyle]}>
        <CountdownTimer
          targetTime={session.desiredEndTime}
          variant="large"
          showSeconds={false}
          style={styles.countdownNumber}
        />
      </Animated.View>

      <Animated.View style={[styles.plateBlock, plateStyle]}>
        <View style={styles.plateUnderlineWrap}>
          <Text style={[typography.headlineMd, styles.plateText]}>
            {session.plate}
          </Text>
          <View style={styles.plateUnderline} />
        </View>
        <Text style={[typography.bodyMd, styles.locationText]}>
          Ponce Springs
        </Text>
      </Animated.View>

      <Animated.View style={[styles.actions, actionsStyle]}>
        <Pressable
          onPress={() => router.push("/extend-duration")}
          style={({ pressed }) => [
            styles.primaryCta,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add time"
        >
          <Text style={[typography.titleLg, styles.primaryCtaLabel]}>
            Add time
          </Text>
          <Text style={styles.primaryCtaArrow}></Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/confirm-stop")}
          hitSlop={12}
          style={styles.secondaryCta}
          accessibilityRole="button"
          accessibilityLabel="End session"
        >
          <Text style={[typography.bodyMd, styles.secondaryCtaLabel]}>
            End session
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Inactive states
// ─────────────────────────────────────────────────────────────

type InactiveCommonProps = {
  onPark: (plate: string) => Promise<void>;
  loadingPlate: string | null;
  error: string;
};

function FirstTimerState() {
  return (
    <View style={styles.heroBlock}>
      <Text style={[typography.labelSm, styles.kicker]}>New here</Text>
      <Text style={[typography.displayMd, styles.firstTimerTitle]}>
        Guest on the way?
      </Text>
      <Text style={[typography.bodyLg, styles.firstTimerBody]}>
        Add their plate and we'll keep them parked. Auto-renew, auto-everything.
      </Text>
      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push("/start-parking")}
          style={({ pressed }) => [
            styles.primaryCta,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Park a guest"
        >
          <Text style={[typography.titleLg, styles.primaryCtaLabel]}>
            Park a guest
          </Text>
          <Text style={styles.primaryCtaArrow}></Text>
        </Pressable>
      </View>
    </View>
  );
}

function SingleVehicleState({
  plate,
  lastUsedAt,
  onPark,
  loading,
}: {
  plate: string;
  lastUsedAt: number | null;
  onPark: (plate: string) => void;
  loading: boolean;
}) {
  return (
    <View style={styles.heroBlock}>
      {lastUsedAt ? (
        <Text style={[typography.labelSm, styles.kicker]}>
          Last parked · {formatRelative(lastUsedAt)}
        </Text>
      ) : (
        <Text style={[typography.labelSm, styles.kicker]}>Ready</Text>
      )}
      <Text style={[typography.displayMd, styles.endTime]}>
        Park your guest.
      </Text>
      <View style={styles.plateBlock}>
        <View style={styles.plateUnderlineWrap}>
          <Text style={[typography.displaySm, styles.singlePlate]}>
            {plate}
          </Text>
          <View style={styles.plateUnderline} />
        </View>
        <Text style={[typography.bodyMd, styles.locationText]}>
          4 hours · auto-renewing
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => onPark(plate)}
          disabled={loading}
          style={({ pressed }) => [
            styles.primaryCta,
            loading && styles.primaryCtaDisabled,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Park ${plate}`}
        >
          <Text style={[typography.titleLg, styles.primaryCtaLabel]}>
            {loading ? "Parking…" : `Park ${plate}`}
          </Text>
          {!loading ? <Text style={styles.primaryCtaArrow}></Text> : null}
        </Pressable>

        <Pressable
          onPress={() => router.push("/start-parking")}
          hitSlop={12}
          style={styles.secondaryCta}
          accessibilityRole="button"
        >
          <Text style={[typography.bodyMd, styles.secondaryCtaLabel]}>
            A different car
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function MultiVehicleState({
  primary,
  others,
  lastParkedPlate,
  lastParkedAt,
  onPark,
  loadingPlate,
}: {
  primary: { _id: string; plate: string };
  others: { _id: string; plate: string }[];
  lastParkedPlate: string | null;
  lastParkedAt: number | null;
  onPark: (plate: string) => void;
  loadingPlate: string | null;
}) {
  const primaryLoading = loadingPlate === primary.plate;
  const kickerText =
    lastParkedPlate === primary.plate && lastParkedAt
      ? `Last parked · ${formatRelative(lastParkedAt)}`
      : "Ready";

  return (
    <View style={styles.heroBlock}>
      <Text style={[typography.labelSm, styles.kicker]}>{kickerText}</Text>
      <Text style={[typography.displayMd, styles.endTime]}>
        Park your guest.
      </Text>

      <View style={styles.plateBlock}>
        <View style={styles.plateUnderlineWrap}>
          <Text style={[typography.displaySm, styles.singlePlate]}>
            {primary.plate}
          </Text>
          <View style={styles.plateUnderline} />
        </View>
        <Text style={[typography.bodyMd, styles.locationText]}>
          4 hours · auto-renewing
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => onPark(primary.plate)}
          disabled={primaryLoading}
          style={({ pressed }) => [
            styles.primaryCta,
            primaryLoading && styles.primaryCtaDisabled,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Park ${primary.plate}`}
        >
          <Text style={[typography.titleLg, styles.primaryCtaLabel]}>
            {primaryLoading ? "Parking…" : `Park ${primary.plate}`}
          </Text>
          {!primaryLoading ? (
            <Text style={styles.primaryCtaArrow}></Text>
          ) : null}
        </Pressable>
      </View>

      {others.length > 0 ? (
        <View style={styles.otherList}>
          <Text style={[typography.labelSm, styles.otherListLabel]}>
            Other cars
          </Text>
          {others.map((v) => {
            const loading = loadingPlate === v.plate;
            return (
              <Pressable
                key={v._id}
                onPress={() => onPark(v.plate)}
                disabled={loading}
                style={({ pressed }) => [
                  styles.otherRow,
                  pressed && styles.otherRowPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Park ${v.plate}`}
              >
                <Text style={[typography.titleLg, styles.otherPlate]}>
                  {v.plate}
                </Text>
                <Text style={[typography.bodyMd, styles.otherAction]}>
                  {loading ? "Parking…" : "Park"}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => router.push("/start-parking")}
            hitSlop={12}
            style={styles.secondaryCta}
            accessibilityRole="button"
          >
            <Text style={[typography.bodyMd, styles.secondaryCtaLabel]}>
              A different car
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function InactiveState({
  lastParkedPlate,
  lastParkedAt,
}: {
  lastParkedPlate: string | null;
  lastParkedAt: number | null;
}) {
  const vehicles = useQuery(api.vehicles.list) ?? [];
  const createSession = useMutation(api.sessions.create);
  const [loadingPlate, setLoadingPlate] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handlePark = useCallback(
    async (plate: string) => {
      setLoadingPlate(plate);
      setError("");
      try {
        await createSession({
          plate,
          durationMinutes: DEFAULT_DURATION_MINUTES,
        });
      } catch (err) {
        const friendly = mapConvexError(err);
        setError(friendly);
        Sentry.captureException(
          err instanceof Error ? err : new Error(friendly),
        );
      } finally {
        setLoadingPlate(null);
      }
    },
    [createSession],
  );

  if (vehicles.length === 0) {
    return <FirstTimerState />;
  }

  // Sort so last-parked vehicle is primary (fallback to lastUsedAt)
  const sorted = [...vehicles].sort((a, b) => {
    if (lastParkedPlate) {
      if (a.plate === lastParkedPlate) return -1;
      if (b.plate === lastParkedPlate) return 1;
    }
    return (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0);
  });

  if (sorted.length === 1) {
    const v = sorted[0];
    return (
      <>
        <SingleVehicleState
          plate={v.plate}
          lastUsedAt={
            lastParkedPlate === v.plate ? lastParkedAt : (v.lastUsedAt ?? null)
          }
          onPark={handlePark}
          loading={loadingPlate === v.plate}
        />
        {error ? <InlineError message={error} /> : null}
      </>
    );
  }

  const [primary, ...rest] = sorted;
  return (
    <>
      <MultiVehicleState
        primary={{ _id: primary._id, plate: primary.plate }}
        others={rest.slice(0, 2).map((r) => ({ _id: r._id, plate: r.plate }))}
        lastParkedPlate={lastParkedPlate}
        lastParkedAt={lastParkedAt}
        onPark={handlePark}
        loadingPlate={loadingPlate}
      />
      {error ? <InlineError message={error} /> : null}
    </>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <View style={styles.inlineErrorBox}>
      <Text style={[typography.bodySm, styles.inlineErrorText]}>{message}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const session = useQuery(api.sessions.getActive);
  const lastParked = useQuery(api.sessions.getLastParked);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {session === undefined || lastParked === undefined ? (
        <LoadingState />
      ) : session === null ? (
        <InactiveState
          lastParkedPlate={lastParked?.plate ?? null}
          lastParkedAt={lastParked?.endedAt ?? null}
        />
      ) : (
        <ActiveState session={session} />
      )}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing["2xl"],
  },
  loadingText: {
    color: colors.onSurfaceVariant,
  },

  heroBlock: {
    flex: 1,
    paddingHorizontal: spacing["2xl"],
    paddingTop: spacing["3xl"],
    paddingBottom: spacing.lg,
    justifyContent: "flex-start",
  },

  kicker: {
    color: colors.accent,
    marginBottom: spacing.sm,
  },
  kickerError: {
    color: colors.error,
    marginBottom: spacing.sm,
  },

  endTime: {
    color: colors.primary,
    marginBottom: spacing.xl,
  },
  firstTimerTitle: {
    color: colors.primary,
    marginBottom: spacing.md,
  },
  firstTimerBody: {
    color: colors.onSurfaceVariant,
    maxWidth: 340,
    marginBottom: spacing["3xl"],
  },
  failedTitle: {
    color: colors.primary,
    marginBottom: spacing.md,
  },
  failedBody: {
    color: colors.onSurfaceVariant,
    marginBottom: spacing["3xl"],
  },

  countdownBlock: {
    marginBottom: spacing["2xl"],
  },
  countdownNumber: {
    ...typography.displayHero,
    color: colors.primary,
    textAlign: "left",
    fontVariant: ["tabular-nums"],
  },

  plateBlock: {
    marginBottom: spacing["3xl"],
  },
  plateUnderlineWrap: {
    alignSelf: "flex-start",
  },
  plateText: {
    color: colors.primary,
  },
  singlePlate: {
    color: colors.primary,
  },
  plateUnderline: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: -2,
    width: "80%",
  },
  locationText: {
    color: colors.onSurfaceVariant,
    marginTop: spacing.sm,
  },

  actions: {
    marginTop: "auto",
    gap: spacing.md,
  },
  primaryCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg + 2,
    paddingHorizontal: spacing["2xl"],
    borderRadius: radius.lg,
    minHeight: 56,
  },
  primaryCtaDisabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  primaryCtaLabel: {
    color: colors.onPrimary,
  },
  primaryCtaArrow: {
    color: colors.onPrimary,
    fontSize: 22,
  },
  secondaryCta: {
    alignSelf: "center",
    paddingVertical: spacing.sm,
  },
  secondaryCtaLabel: {
    color: colors.onSurfaceVariant,
  },

  otherList: {
    marginTop: spacing.xl,
    gap: spacing.xs,
  },
  otherListLabel: {
    color: colors.onSurfaceMuted,
    marginBottom: spacing.sm,
  },
  otherRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  otherRowPressed: {
    opacity: 0.7,
  },
  otherPlate: {
    color: colors.primary,
  },
  otherAction: {
    color: colors.accent,
    fontFamily: "Figtree_600SemiBold",
  },

  retryLink: {
    alignSelf: "center",
    paddingVertical: spacing.sm,
  },
  retryLabel: {
    color: colors.accent,
    fontFamily: "Figtree_600SemiBold",
  },
  retryDisabled: {
    color: colors.onSurfaceMuted,
  },

  inlineErrorBox: {
    marginHorizontal: spacing["2xl"],
    marginBottom: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.errorContainer,
    borderRadius: radius.md,
  },
  inlineErrorText: {
    color: colors.error,
  },
});
