import { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  AccessibilityInfo,
} from "react-native";
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { colors, typography, spacing, radius } from "@/src/theme";
import { CountdownTimer } from "@/src/components/CountdownTimer";
import type { SessionState } from "@/src/domain/renewal";

const EASE_OUT_QUART = Easing.bezier(0.25, 1, 0.5, 1);

type HeroSession = { plate: string; desiredEndTime: number };

type Props = {
  state: SessionState;
  session: HeroSession;
  onRenew: () => void;
  onAddTime: () => void;
  onEnd: () => void;
};

type HeroCopy = {
  kicker: string;
  headline: string;
  isError: boolean;
  primary: { label: string; action: "renew" | "addTime" };
};

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function copyFor(state: SessionState, fallbackUntil: number): HeroCopy {
  switch (state.kind) {
    case "awaiting_first":
      return {
        kicker: "Not registered yet",
        headline: "Tap to register",
        isError: false,
        primary: { label: "Register now", action: "renew" },
      };
    case "due":
      return {
        kicker: "Renewal due",
        headline: formatClock(state.until),
        isError: false,
        primary: { label: "Renew now", action: "renew" },
      };
    case "unregistered":
      return {
        kicker: "Unregistered since",
        headline: formatClock(state.since),
        isError: true,
        primary: { label: "Renew now", action: "renew" },
      };
    case "registered":
    case "done":
      return {
        kicker: "Registered until",
        headline: formatClock(
          state.kind === "registered" ? state.until : fallbackUntil,
        ),
        isError: false,
        primary: { label: "Add time", action: "addTime" },
      };
  }
}

function useEntrance(value: { value: number }, from: number, scale?: number) {
  return useAnimatedStyle(() => ({
    opacity: value.value,
    transform: [
      { translateY: interpolate(value.value, [0, 1], [from, 0]) },
      ...(scale
        ? [{ scale: interpolate(value.value, [0, 1], [scale, 1]) }]
        : []),
    ],
  }));
}

function useHeroEntrance() {
  const kicker = useSharedValue(0);
  const label = useSharedValue(0);
  const countdown = useSharedValue(0);
  const plate = useSharedValue(0);
  const actions = useSharedValue(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      const d = reduced ? 0 : 1;
      const base = reduced ? 120 : 520;
      const run = (v: { value: number }, delay: number, extra = 0) => {
        v.value = withDelay(
          delay * d,
          withTiming(1, { duration: base + extra, easing: EASE_OUT_QUART }),
        );
      };
      run(kicker, 80);
      run(label, 180);
      run(countdown, 320, 120);
      run(plate, 500);
      run(actions, 640);
    });
  }, [kicker, label, countdown, plate, actions]);

  return {
    kickerStyle: useEntrance(kicker, 10),
    labelStyle: useEntrance(label, 16),
    countdownStyle: useEntrance(countdown, 24, 0.96),
    plateStyle: useEntrance(plate, 16),
    actionsStyle: useEntrance(actions, 20),
  };
}

export function ActiveSessionHero({
  state,
  session,
  onRenew,
  onAddTime,
  onEnd,
}: Props) {
  const anim = useHeroEntrance();
  const copy = copyFor(state, session.desiredEndTime);
  const onPrimary = copy.primary.action === "renew" ? onRenew : onAddTime;

  return (
    <View style={styles.heroBlock}>
      <Animated.Text
        style={[
          typography.labelSm,
          copy.isError ? styles.kickerError : styles.kicker,
          anim.kickerStyle,
        ]}
      >
        {copy.kicker}
      </Animated.Text>
      <Animated.Text
        style={[typography.displayMd, styles.headline, anim.labelStyle]}
      >
        {copy.headline}
      </Animated.Text>

      <Animated.View style={[styles.countdownBlock, anim.countdownStyle]}>
        <CountdownTimer
          targetTime={session.desiredEndTime}
          variant="large"
          showSeconds={false}
          style={styles.countdownNumber}
        />
      </Animated.View>

      <Animated.View style={[styles.plateBlock, anim.plateStyle]}>
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

      <Animated.View style={[styles.actions, anim.actionsStyle]}>
        <Pressable
          onPress={onPrimary}
          style={({ pressed }) => [
            styles.primaryCta,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={copy.primary.label}
        >
          <Text style={[typography.titleLg, styles.primaryCtaLabel]}>
            {copy.primary.label}
          </Text>
          <Text style={styles.primaryCtaArrow}></Text>
        </Pressable>

        <Pressable
          onPress={onEnd}
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

const styles = StyleSheet.create({
  heroBlock: {
    flex: 1,
    paddingHorizontal: spacing["2xl"],
    paddingTop: spacing["3xl"],
    paddingBottom: spacing.lg,
    justifyContent: "flex-start",
  },
  kicker: { color: colors.accent, marginBottom: spacing.sm },
  kickerError: { color: colors.error, marginBottom: spacing.sm },
  headline: { color: colors.primary, marginBottom: spacing.xl },
  countdownBlock: { marginBottom: spacing["2xl"] },
  countdownNumber: {
    ...typography.displayHero,
    color: colors.primary,
    textAlign: "left",
    fontVariant: ["tabular-nums"],
  },
  plateBlock: { marginBottom: spacing["3xl"] },
  plateUnderlineWrap: { alignSelf: "flex-start" },
  plateText: { color: colors.primary },
  plateUnderline: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: -2,
    width: "80%",
  },
  locationText: { color: colors.onSurfaceVariant, marginTop: spacing.sm },
  actions: { marginTop: "auto", gap: spacing.md },
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
  pressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  primaryCtaLabel: { color: colors.onPrimary },
  primaryCtaArrow: { color: colors.onPrimary, fontSize: 22 },
  secondaryCta: { alignSelf: "center", paddingVertical: spacing.sm },
  secondaryCtaLabel: { color: colors.onSurfaceVariant },
});
