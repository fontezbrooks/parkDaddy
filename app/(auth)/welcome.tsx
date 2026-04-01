import { View, Text, StyleSheet, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { colors, typography, spacing } from "@/src/theme";
import { GradientButton } from "@/src/components/GradientButton";

export default function WelcomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>P</Text>
        </View>
        <Text style={[typography.headlineSm, { color: colors.primary }]}>
          parkDaddy
        </Text>
      </View>

      <View style={styles.content}>
        <Text style={[typography.headlineLg, styles.title]}>
          Welcome to{"\n"}parkDaddy
        </Text>
        <Text style={[typography.bodyLg, styles.subtitle]}>
          Automated guest parking renewals for Ponce Springs residents. Never
          worry about a boot again.
        </Text>
      </View>

      <View style={styles.actions}>
        <GradientButton
          title="Get Started"
          onPress={() => router.push("/(auth)/sign-up")}
        />
        <GradientButton
          title="Sign In"
          variant="outline"
          onPress={() => router.push("/(auth)/sign-in")}
        />
      </View>

      <View style={styles.statusPill}>
        <View style={styles.statusDot} />
        <Text style={[typography.labelSm, { color: colors.primary }]}>
          SYSTEM ONLINE
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  hero: {
    alignItems: "center",
    marginTop: spacing["3xl"],
    gap: spacing.sm,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    color: colors.onPrimary,
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    color: colors.primary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  subtitle: {
    color: colors.onSurfaceVariant,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  actions: {
    gap: spacing.md,
    paddingBottom: spacing["3xl"],
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingBottom: spacing.lg,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.tertiary,
  },
});
