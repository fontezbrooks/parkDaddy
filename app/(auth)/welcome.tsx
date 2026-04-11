import { useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  AccessibilityInfo,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import { router } from "expo-router";
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  interpolate,
} from "react-native-reanimated";
import { colors, typography, spacing, radius } from "@/src/theme";

const EASE_OUT_QUART = Easing.bezier(0.25, 1, 0.5, 1);

export default function WelcomeScreen() {
  const { isSignedIn } = useAuth();
  const { width } = useWindowDimensions();

  const line1 = useSharedValue(0);
  const line2 = useSharedValue(0);
  const line3 = useSharedValue(0);
  const tag = useSharedValue(0);
  const cta = useSharedValue(0);
  const drift = useSharedValue(0);

  useEffect(() => {
    let reduceMotion = false;
    AccessibilityInfo.isReduceMotionEnabled().then((r) => {
      reduceMotion = r;
      const d = reduceMotion ? 0 : 1;
      const base = reduceMotion ? 150 : 520;
      line1.value = withDelay(
        80 * d,
        withTiming(1, { duration: base, easing: EASE_OUT_QUART }),
      );
      line2.value = withDelay(
        220 * d,
        withTiming(1, { duration: base, easing: EASE_OUT_QUART }),
      );
      line3.value = withDelay(
        380 * d,
        withTiming(1, { duration: base, easing: EASE_OUT_QUART }),
      );
      tag.value = withDelay(
        560 * d,
        withTiming(1, { duration: 420, easing: EASE_OUT_QUART }),
      );
      cta.value = withDelay(
        700 * d,
        withTiming(1, { duration: 480, easing: EASE_OUT_QUART }),
      );

      if (!reduceMotion) {
        drift.value = withRepeat(
          withSequence(
            withTiming(1, { duration: 7000, easing: Easing.inOut(Easing.sin) }),
            withTiming(0, { duration: 7000, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          false,
        );
      }
    });
  }, [line1, line2, line3, tag, cta, drift]);

  const line1Style = useAnimatedStyle(() => ({
    opacity: line1.value,
    transform: [{ translateY: interpolate(line1.value, [0, 1], [24, 0]) }],
  }));
  const line2Style = useAnimatedStyle(() => ({
    opacity: line2.value,
    transform: [{ translateY: interpolate(line2.value, [0, 1], [24, 0]) }],
  }));
  const line3Style = useAnimatedStyle(() => ({
    opacity: line3.value,
    transform: [{ translateY: interpolate(line3.value, [0, 1], [24, 0]) }],
  }));
  const tagStyle = useAnimatedStyle(() => ({
    opacity: tag.value,
    transform: [{ translateY: interpolate(tag.value, [0, 1], [16, 0]) }],
  }));
  const ctaStyle = useAnimatedStyle(() => ({
    opacity: cta.value,
    transform: [{ translateY: interpolate(cta.value, [0, 1], [20, 0]) }],
  }));

  const blobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [-40, 40]) },
      { translateY: interpolate(drift.value, [0, 1], [-20, 30]) },
      { scale: interpolate(drift.value, [0, 1], [1, 1.12]) },
    ],
  }));
  const blob2Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [30, -30]) },
      { translateY: interpolate(drift.value, [0, 1], [20, -10]) },
      { scale: interpolate(drift.value, [0, 1], [1.08, 1]) },
    ],
  }));

  const handleGetStarted = useCallback(() => {
    if (isSignedIn) {
      router.replace("/(tabs)");
    } else {
      router.push("/(auth)/sign-up");
    }
  }, [isSignedIn]);

  const handleSignIn = useCallback(() => {
    router.push("/(auth)/sign-in");
  }, []);

  const primaryCta = isSignedIn ? "Resume" : "Get started";
  const blobSize = Math.max(width * 0.9, 320);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View pointerEvents="none" style={styles.backdrop}>
        <Animated.View
          style={[
            styles.blob,
            {
              width: blobSize,
              height: blobSize,
              borderRadius: blobSize / 2,
              backgroundColor: colors.tertiary,
              top: -blobSize * 0.35,
              right: -blobSize * 0.35,
            },
            blobStyle,
          ]}
        />
        <Animated.View
          style={[
            styles.blob,
            {
              width: blobSize * 0.8,
              height: blobSize * 0.8,
              borderRadius: (blobSize * 0.8) / 2,
              backgroundColor: colors.accent,
              opacity: 0.22,
              bottom: -blobSize * 0.25,
              left: -blobSize * 0.2,
            },
            blob2Style,
          ]}
        />
      </View>

      <View style={styles.wordmarkRow}>
        <Text style={[typography.labelSm, { color: colors.primary }]}>
          parkDaddy
        </Text>
      </View>

      <View style={styles.headlineBlock}>
        <Animated.Text
          style={[typography.displayLg, styles.headlineLine, line1Style]}
        >
          Guest
        </Animated.Text>
        <Animated.Text
          style={[typography.displayLg, styles.headlineLine, line2Style]}
        >
          parking,
        </Animated.Text>
        <Animated.View style={[styles.handledWrap, line3Style]}>
          <Text style={[typography.displayLg, styles.handled]}>handled.</Text>
          <View style={styles.handledUnderline} />
        </Animated.View>
      </View>

      <Animated.View style={[styles.tag, tagStyle]}>
        <Text style={[typography.bodyLg, styles.tagText]}>
          One tap. Auto-renewing. Your guest stays parked,{" "}
          <Text style={styles.tagEmphasis}>you stay chill.</Text>
        </Text>
      </Animated.View>

      <Animated.View style={[styles.actions, ctaStyle]}>
        <Pressable
          onPress={handleGetStarted}
          style={({ pressed }) => [
            styles.primaryCta,
            pressed && styles.primaryCtaPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={primaryCta}
        >
          <Text style={[typography.titleLg, styles.primaryCtaLabel]}>
            {primaryCta}
          </Text>
          <Text style={[typography.titleLg, styles.primaryCtaArrow]}></Text>
        </Pressable>

        {!isSignedIn ? (
          <Pressable
            onPress={handleSignIn}
            hitSlop={12}
            style={styles.secondaryCta}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            <Text style={[typography.bodyMd, styles.secondaryCtaLabel]}>
              Already have an account?{" "}
              <Text style={styles.secondaryCtaLink}>Sign in</Text>
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing["2xl"],
    overflow: "hidden",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  blob: {
    position: "absolute",
    opacity: 0.35,
  },
  wordmarkRow: {
    marginTop: spacing.lg,
  },
  headlineBlock: {
    flex: 1,
    justifyContent: "center",
    marginTop: spacing["3xl"],
  },
  headlineLine: {
    color: colors.primary,
  },
  handledWrap: {
    alignSelf: "flex-start",
  },
  handled: {
    color: colors.primary,
  },
  handledUnderline: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: -2,
    width: "62%",
  },
  tag: {
    marginBottom: spacing["3xl"],
    maxWidth: 360,
  },
  tagText: {
    color: colors.onSurfaceVariant,
  },
  tagEmphasis: {
    color: colors.primary,
    fontFamily: "Figtree_600SemiBold",
  },
  actions: {
    paddingBottom: spacing.lg,
    gap: spacing.lg,
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
  primaryCtaPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  primaryCtaLabel: {
    color: colors.onPrimary,
  },
  primaryCtaArrow: {
    color: colors.onPrimary,
    fontSize: 20,
  },
  secondaryCta: {
    alignSelf: "center",
    paddingVertical: spacing.sm,
  },
  secondaryCtaLabel: {
    color: colors.onSurfaceVariant,
  },
  secondaryCtaLink: {
    color: colors.primary,
    fontFamily: "Figtree_600SemiBold",
  },
});
