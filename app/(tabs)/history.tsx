import { View, Text, StyleSheet, SectionList, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { colors, typography, spacing, radius } from "@/src/theme";

type SessionItem = NonNullable<ReturnType<typeof useQuery<typeof api.sessions.listHistory>>>[number];

function getStatusConfig(status: string) {
  switch (status) {
    case "completed":
      return { color: colors.tertiary, label: "Completed" };
    case "cancelled":
      return { color: "#FFD60A", label: "Stopped Early" };
    case "failed":
      return { color: colors.secondary, label: "Failed" };
    default:
      return { color: colors.onSurfaceVariant, label: status };
  }
}

function groupByPeriod(sessions: SessionItem[]) {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const recent: SessionItem[] = [];
  const older: SessionItem[] = [];

  for (const s of sessions) {
    if (s._creationTime >= thirtyDaysAgo) {
      recent.push(s);
    } else {
      older.push(s);
    }
  }

  const sections = [];
  if (recent.length > 0) {
    sections.push({ title: "Last 30 Days", data: recent });
  }
  if (older.length > 0) {
    sections.push({ title: "Older", data: older });
  }
  return sections;
}

function SessionCard({ session }: { session: SessionItem }) {
  const statusConfig = getStatusConfig(session.status);
  const date = new Date(session._creationTime);
  const durationMs = session.desiredEndTime - session._creationTime;
  const durationHours = Math.round(durationMs / (60 * 60 * 1000) * 10) / 10;

  return (
    <Pressable style={styles.card}>
      <View style={styles.cardLeft}>
        <View style={[styles.statusDot, { backgroundColor: statusConfig.color }]} />
        <View style={styles.cardInfo}>
          <Text style={[typography.bodySm, { color: colors.onSurfaceVariant }]}>
            {date.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </Text>
          <Text style={[typography.headlineSm, { color: colors.primary }]}>
            {session.plate}
          </Text>
          <Text style={[typography.bodySm, { color: colors.onSurfaceVariant }]}>
            {durationHours} hours parked
          </Text>
        </View>
      </View>
      <View style={[styles.badge, { backgroundColor: statusConfig.color }]}>
        <Text style={[typography.labelSm, { color: "#fff" }]}>
          {statusConfig.label}
        </Text>
      </View>
    </Pressable>
  );
}

export default function HistoryScreen() {
  const sessions = useQuery(api.sessions.listHistory) ?? [];
  const sections = groupByPeriod(sessions);

  return (
    <SafeAreaView style={styles.container}>
      <Text
        style={[
          typography.headlineLg,
          { color: colors.onSurface, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
        ]}
      >
        History
      </Text>

      {sections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[typography.bodyMd, { color: colors.onSurfaceVariant }]}>
            No parking sessions yet
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => <SessionCard session={item} />}
          renderSectionHeader={({ section }) => (
            <Text style={[typography.labelMd, styles.sectionHeader]}>
              {section.title}
            </Text>
          )}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          stickySectionHeadersEnabled={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing["3xl"],
  },
  sectionHeader: {
    color: colors.onSurfaceVariant,
    paddingVertical: spacing.md,
  },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  cardInfo: {
    gap: 2,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
