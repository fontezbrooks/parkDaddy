import { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Pressable,
  AccessibilityInfo,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
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
import { colors, typography, spacing } from "@/src/theme";

const EASE_OUT_QUART = Easing.bezier(0.25, 1, 0.5, 1);

type SessionItem = NonNullable<
  ReturnType<typeof useQuery<typeof api.sessions.listHistory>>
>[number];

function getStatusStyle(status: string) {
  switch (status) {
    case "completed":
      return { color: colors.primary, label: "Completed" };
    case "cancelled":
      return { color: colors.onSurfaceMuted, label: "Ended early" };
    case "failed":
      return { color: colors.error, label: "Failed" };
    default:
      return { color: colors.onSurfaceVariant, label: status };
  }
}

// Extended Stay sessions store desiredEndTime as MAX_SAFE_INTEGER (sentinel
// for indefinite). Treat their actual coverage as start → last successful
// renewal so summary math stays finite.
function sessionCoverageMs(s: SessionItem): number {
  const isExtended = (s.mode ?? "daily") === "extended";
  const end = isExtended
    ? (s.lastParkEnd ?? s._creationTime)
    : s.desiredEndTime;
  return Math.max(0, end - s._creationTime);
}

function computeSummary(sessions: SessionItem[]) {
  const now = new Date();
  const thisMonth = sessions.filter((s) => {
    const d = new Date(s._creationTime);
    return (
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    );
  });
  const totalHours = Math.round(
    sessions.reduce((acc, s) => acc + sessionCoverageMs(s) / 3600000, 0),
  );
  const failedCount = sessions.filter((s) => s.status === "failed").length;
  return {
    total: sessions.length,
    thisMonth: thisMonth.length,
    totalHours,
    allGood: failedCount === 0,
  };
}

function groupByPeriod(sessions: SessionItem[]) {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent: SessionItem[] = [];
  const older: SessionItem[] = [];
  for (const s of sessions) {
    (s._creationTime >= thirtyDaysAgo ? recent : older).push(s);
  }
  const sections = [];
  if (recent.length > 0) sections.push({ title: "Last 30 days", data: recent });
  if (older.length > 0) sections.push({ title: "Older", data: older });
  return sections;
}

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
    <View style={styles.centered}>
      <Animated.Text style={[typography.bodyLg, styles.loadingText, style]}>
        Loading your history…
      </Animated.Text>
    </View>
  );
}

function useStaggerEntrance(deps: unknown[] = []) {
  const v1 = useSharedValue(0);
  const v2 = useSharedValue(0);
  const v3 = useSharedValue(0);
  const v4 = useSharedValue(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((r) => {
      const d = r ? 0 : 1;
      const base = r ? 120 : 520;
      v1.value = withDelay(
        80 * d,
        withTiming(1, { duration: base, easing: EASE_OUT_QUART }),
      );
      v2.value = withDelay(
        200 * d,
        withTiming(1, { duration: base, easing: EASE_OUT_QUART }),
      );
      v3.value = withDelay(
        360 * d,
        withTiming(1, { duration: base, easing: EASE_OUT_QUART }),
      );
      v4.value = withDelay(
        500 * d,
        withTiming(1, { duration: base, easing: EASE_OUT_QUART }),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const s1 = useAnimatedStyle(() => ({
    opacity: v1.value,
    transform: [{ translateY: interpolate(v1.value, [0, 1], [10, 0]) }],
  }));
  const s2 = useAnimatedStyle(() => ({
    opacity: v2.value,
    transform: [{ translateY: interpolate(v2.value, [0, 1], [16, 0]) }],
  }));
  const s3 = useAnimatedStyle(() => ({
    opacity: v3.value,
    transform: [{ translateY: interpolate(v3.value, [0, 1], [16, 0]) }],
  }));
  const s4 = useAnimatedStyle(() => ({
    opacity: v4.value,
    transform: [{ translateY: interpolate(v4.value, [0, 1], [20, 0]) }],
  }));

  return [s1, s2, s3, s4] as const;
}

function EmptyState() {
  const [kickerStyle, headingStyle, bodyStyle, ctaStyle] = useStaggerEntrance();

  return (
    <View style={styles.heroBlock}>
      <Animated.Text style={[typography.labelSm, styles.kicker, kickerStyle]}>
        Your guests
      </Animated.Text>
      <Animated.Text
        style={[typography.displaySm, styles.heading, headingStyle]}
      >
        No guests yet.
      </Animated.Text>
      <Animated.Text style={[typography.bodyLg, styles.emptyBody, bodyStyle]}>
        When you park a guest, the receipts show up here.
      </Animated.Text>
      <Animated.View style={[styles.ctaWrap, ctaStyle]}>
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
        </Pressable>
      </Animated.View>
    </View>
  );
}

function SummaryHeader({
  summary,
}: {
  summary: ReturnType<typeof computeSummary>;
}) {
  const [kickerStyle, headingStyle, bodyStyle] = useStaggerEntrance();

  const headingText =
    summary.thisMonth > 0
      ? summary.allGood
        ? "All covered."
        : "Mostly covered."
      : "All caught up.";

  const bodyParts: string[] = [];
  if (summary.thisMonth > 0) {
    bodyParts.push(
      `${summary.thisMonth} ${summary.thisMonth === 1 ? "session" : "sessions"} this month`,
    );
  }
  if (summary.totalHours > 0) {
    bodyParts.push(`${summary.totalHours} hours parked`);
  }
  const bodyText =
    bodyParts.length > 0
      ? bodyParts.join(" · ")
      : `${summary.total} sessions total`;

  return (
    <View style={styles.summaryBlock}>
      <Animated.Text style={[typography.labelSm, styles.kicker, kickerStyle]}>
        Your guests
      </Animated.Text>
      <Animated.Text
        style={[typography.displaySm, styles.heading, headingStyle]}
      >
        {headingText}
      </Animated.Text>
      <Animated.Text style={[typography.bodyMd, styles.summaryBody, bodyStyle]}>
        {bodyText}
      </Animated.Text>
    </View>
  );
}

function SessionRow({ session }: { session: SessionItem }) {
  const status = getStatusStyle(session.status);
  const date = new Date(session._creationTime);
  const isExtended = (session.mode ?? "daily") === "extended";
  const durationHours =
    Math.round((sessionCoverageMs(session) / 3600000) * 10) / 10;
  const durationLabel = isExtended ? "Extended Stay" : `${durationHours}h`;

  return (
    <View
      style={styles.sessionRow}
      accessible
      accessibilityLabel={`${session.plate}, ${status.label}, ${durationLabel} on ${date.toLocaleDateString()}`}
    >
      <View>
        <Text style={[typography.headlineMd, styles.sessionPlate]}>
          {session.plate}
        </Text>
        <Text style={[typography.bodySm, styles.sessionMeta]}>
          {date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}{" "}
          · {durationLabel}
        </Text>
      </View>
      <Text style={[typography.bodySm, { color: status.color }]}>
        {status.label}
      </Text>
    </View>
  );
}

export default function HistoryScreen() {
  const sessionsResult = useQuery(api.sessions.listHistory);
  const isLoading = sessionsResult === undefined;
  const sessions = sessionsResult ?? [];
  const sections = groupByPeriod(sessions);
  const summary = computeSummary(sessions);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingState />
      </SafeAreaView>
    );
  }

  if (sessions.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <EmptyState />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <SectionList
        ListHeaderComponent={<SummaryHeader summary={summary} />}
        sections={sections}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => <SessionRow session={item} />}
        renderSectionHeader={({ section }) => (
          <Text style={[typography.labelSm, styles.sectionHeader]}>
            {section.title}
          </Text>
        )}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  centered: {
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
    justifyContent: "flex-start",
  },
  kicker: {
    color: colors.accent,
    marginBottom: spacing.sm,
  },
  heading: {
    color: colors.primary,
    marginBottom: spacing.md,
  },
  emptyBody: {
    color: colors.onSurfaceVariant,
    maxWidth: 320,
    marginBottom: spacing["3xl"],
  },
  ctaWrap: {
    marginTop: "auto",
    paddingBottom: spacing.lg,
  },
  primaryCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg + 2,
    paddingHorizontal: spacing["2xl"],
    borderRadius: 12,
    minHeight: 56,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  primaryCtaLabel: {
    color: colors.onPrimary,
  },

  summaryBlock: {
    paddingHorizontal: spacing["2xl"],
    paddingTop: spacing["3xl"],
    paddingBottom: spacing["2xl"],
  },
  summaryBody: {
    color: colors.onSurfaceVariant,
  },

  listContent: {
    paddingBottom: spacing["3xl"],
  },
  sectionHeader: {
    color: colors.onSurfaceMuted,
    paddingHorizontal: spacing["2xl"],
    paddingTop: spacing["2xl"],
    paddingBottom: spacing.md,
  },
  sessionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing["2xl"],
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  sessionPlate: {
    color: colors.primary,
  },
  sessionMeta: {
    color: colors.onSurfaceVariant,
    marginTop: spacing.xs,
  },
});
