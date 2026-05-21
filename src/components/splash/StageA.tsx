import { useEffect } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { AppWordmark } from "./logos/AppWordmark";
import { DaddyWordmark } from "./logos/DaddyWordmark";
import { StudiosWordmark } from "./logos/StudiosWordmark";
import { PulsingDots } from "./PulsingDots";
import type { SplashStage } from "./AnimatedSplash";

type Props = {
  stage: SplashStage;
  reducedMotion: boolean;
};

const isMedium = Dimensions.get("window").width >= 768;

const APP_W = isMedium ? 384 : 288;
const APP_H = Math.round((APP_W * 208.048) / 589.074);
const DADDY_W = isMedium ? 450 : 288;
const DADDY_H = Math.round((DADDY_W * 784.739) / 1555.26);
const STUDIOS_W = isMedium ? 384 : 288;
const STUDIOS_H = Math.round((STUDIOS_W * 139.902) / 1011.35);

const EASE_OUT = Easing.out(Easing.cubic);
const EASE_IN = Easing.in(Easing.cubic);
const EASE_IN_OUT = Easing.inOut(Easing.cubic);

export function StageA({ stage, reducedMotion }: Props) {
  const appOpacity = useSharedValue(0);
  const appScale = useSharedValue(0.9);
  const daddyOpacity = useSharedValue(0);
  const daddyScale = useSharedValue(0.9);
  const studiosOpacity = useSharedValue(0);
  const studiosScale = useSharedValue(0.9);
  const taglineOpacity = useSharedValue(0);
  const dotsOpacity = useSharedValue(0);

  const groupOpacity = useSharedValue(1);
  const groupScale = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      appOpacity.value = 1;
      appScale.value = 1;
      daddyOpacity.value = 1;
      daddyScale.value = 1;
      studiosOpacity.value = 1;
      studiosScale.value = 1;
      taglineOpacity.value = 1;
      dotsOpacity.value = 1;
      return;
    }

    appOpacity.value = withDelay(200, withTiming(1, { duration: 600, easing: EASE_OUT }));
    appScale.value = withDelay(200, withTiming(1, { duration: 600, easing: EASE_OUT }));
    daddyOpacity.value = withDelay(400, withTiming(1, { duration: 600, easing: EASE_OUT }));
    daddyScale.value = withDelay(400, withTiming(1, { duration: 600, easing: EASE_OUT }));
    studiosOpacity.value = withDelay(600, withTiming(1, { duration: 600, easing: EASE_OUT }));
    studiosScale.value = withDelay(600, withTiming(1, { duration: 600, easing: EASE_OUT }));
    taglineOpacity.value = withDelay(1000, withTiming(1, { duration: 800, easing: Easing.linear }));
    dotsOpacity.value = withDelay(1200, withTiming(1, { duration: 600, easing: Easing.linear }));
  }, [
    reducedMotion,
    appOpacity,
    appScale,
    daddyOpacity,
    daddyScale,
    studiosOpacity,
    studiosScale,
    taglineOpacity,
    dotsOpacity,
  ]);

  useEffect(() => {
    if (stage !== "stageB" && stage !== "stageB-hold" && stage !== "dismissing") {
      return;
    }
    if (reducedMotion) {
      groupOpacity.value = withTiming(0, { duration: 200, easing: Easing.linear });
      return;
    }
    groupOpacity.value = withTiming(0, { duration: 600, easing: EASE_IN });
    groupScale.value = withTiming(0.3, { duration: 800, easing: EASE_IN_OUT });
  }, [stage, reducedMotion, groupOpacity, groupScale]);

  const appStyle = useAnimatedStyle(() => ({
    opacity: appOpacity.value,
    transform: [{ scale: appScale.value }],
  }));
  const daddyStyle = useAnimatedStyle(() => ({
    opacity: daddyOpacity.value,
    transform: [{ scale: daddyScale.value }],
  }));
  const studiosStyle = useAnimatedStyle(() => ({
    opacity: studiosOpacity.value,
    transform: [{ scale: studiosScale.value }],
  }));
  const taglineStyle = useAnimatedStyle(() => ({ opacity: taglineOpacity.value }));
  const dotsStyle = useAnimatedStyle(() => ({ opacity: dotsOpacity.value }));

  const groupStyle = useAnimatedStyle(() => ({
    opacity: groupOpacity.value,
    transform: [{ scale: groupScale.value }],
  }));

  return (
    <Animated.View style={[styles.container, groupStyle]} pointerEvents="none">
      <Animated.View style={[{ width: APP_W, height: APP_H }, appStyle]}>
        <AppWordmark width={APP_W} height={APP_H} />
      </Animated.View>
      <Animated.View style={[{ width: DADDY_W, height: DADDY_H, marginTop: 16 }, daddyStyle]}>
        <DaddyWordmark width={DADDY_W} height={DADDY_H} />
      </Animated.View>
      <Animated.View style={[{ width: STUDIOS_W, height: STUDIOS_H, marginTop: 16 }, studiosStyle]}>
        <StudiosWordmark width={STUDIOS_W} height={STUDIOS_H} />
      </Animated.View>
      <Animated.Text style={[styles.tagline, taglineStyle]}>
        EFFORTLESS AUTOMATION
      </Animated.Text>
      <Animated.View style={[styles.dotsWrapper, dotsStyle]}>
        <PulsingDots reducedMotion={reducedMotion} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  tagline: {
    color: "#94a3b8",
    fontSize: isMedium ? 16 : 14,
    letterSpacing: 4,
    marginTop: 16,
    fontFamily: "Inter_500Medium",
  },
  dotsWrapper: {
    marginTop: 32,
  },
});
