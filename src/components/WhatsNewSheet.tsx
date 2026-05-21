import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { colors, typography, spacing, radius } from "@/src/theme";

const STORAGE_KEY = "parkdaddy.whatsNewVersion";

const BULLETS: { title: string; body: string }[] = [
  {
    title: "One-tap parking",
    body: "No more duration picker. Park On to start, Park Off to stop.",
  },
  {
    title: "Daily mode (default)",
    body: "Parking runs for 24 hours, then asks if you want to continue. Tap the notification to extend in one tap.",
  },
  {
    title: "Extended Stay mode",
    body: "Parking for a week or more? Switch to Extended Stay and we'll auto-renew until you turn it off. We check in weekly so you don't forget.",
  },
  {
    title: "Reliable notifications",
    body: "Push notifications now work — make sure they're enabled in your phone's settings.",
  },
];

export function WhatsNewSheet() {
  const [visible, setVisible] = useState(false);
  const currentVersion = Constants.expoConfig?.version ?? "0.0.0";

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored !== currentVersion) setVisible(true);
      })
      .catch(() => {
        // Storage errors shouldn't block app launch — skip the sheet.
      });
    return () => {
      cancelled = true;
    };
  }, [currentVersion]);

  const handleDismiss = async () => {
    setVisible(false);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, currentVersion);
    } catch {
      // Best-effort persist — if it fails the sheet shows again next launch.
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleDismiss}
    >
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={[typography.labelSm, styles.kicker]}>
            What's new in v{currentVersion}
          </Text>
          <Text style={[typography.displayMd, styles.heading]}>
            Simpler parking, smarter notifications.
          </Text>
          <View style={styles.bullets}>
            {BULLETS.map((b) => (
              <View key={b.title} style={styles.bullet}>
                <Text style={[typography.titleLg, styles.bulletTitle]}>
                  {b.title}
                </Text>
                <Text style={[typography.bodyMd, styles.bulletBody]}>
                  {b.body}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <Pressable
            onPress={handleDismiss}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            accessibilityRole="button"
          >
            <Text style={[typography.titleLg, styles.ctaLabel]}>Got it</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
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
    paddingHorizontal: spacing["2xl"],
    paddingTop: spacing["2xl"],
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  kicker: {
    color: colors.accent,
  },
  heading: {
    color: colors.primary,
    marginBottom: spacing.lg,
  },
  bullets: {
    gap: spacing.xl,
  },
  bullet: {
    gap: spacing.xs,
  },
  bulletTitle: {
    color: colors.onSurface,
  },
  bulletBody: {
    color: colors.onSurfaceVariant,
  },
  footer: {
    paddingHorizontal: spacing["2xl"],
    paddingBottom: spacing.lg,
  },
  cta: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  ctaLabel: {
    color: colors.onPrimary,
  },
});
