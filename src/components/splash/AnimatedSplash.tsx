import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import * as Sentry from "@sentry/react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { BackgroundLayer } from "./BackgroundLayer";
import { StageA } from "./StageA";
import { StageB } from "./StageB";

export type SplashStage =
  | "stageA"
  | "stageA-hold"
  | "stageB"
  | "stageB-hold"
  | "dismissing"
  | "gone";

type Props = {
  appReady: boolean;
};

const STAGE_A_MIN_MS = 1200;
const STAGE_B_DURATION_MS = 800;
const STAGE_B_HOLD_MS = 150;
const DISMISS_MS = 250;
const HARD_TIMEOUT_MS = 5000;

export function AnimatedSplash({ appReady }: Props) {
  const [stage, setStage] = useState<SplashStage>("stageA");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [reducedMotionReady, setReducedMotionReady] = useState(false);
  const mountedAtRef = useRef(Date.now());
  const nativeHiddenRef = useRef(false);
  const overlayOpacity = useSharedValue(1);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (cancelled) return;
        setReducedMotion(value);
        setReducedMotionReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setReducedMotionReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      Sentry.captureMessage("splash_appReady_timeout", "warning");
    }, HARD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (stage !== "stageA") return;
    const elapsed = Date.now() - mountedAtRef.current;
    const remaining = Math.max(0, STAGE_A_MIN_MS - elapsed);

    const timer = setTimeout(() => {
      setStage(appReady ? "stageB" : "stageA-hold");
    }, remaining);
    return () => clearTimeout(timer);
  }, [stage, appReady]);

  useEffect(() => {
    if (stage === "stageA-hold" && appReady) {
      setStage("stageB");
    }
  }, [stage, appReady]);

  useEffect(() => {
    const elapsed = Date.now() - mountedAtRef.current;
    if (elapsed >= HARD_TIMEOUT_MS) return;
    const timer = setTimeout(
      () => {
        if (stage === "stageA" || stage === "stageA-hold") {
          setStage("stageB");
        }
      },
      Math.max(0, HARD_TIMEOUT_MS - elapsed),
    );
    return () => clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== "stageB") return;
    const timer = setTimeout(() => setStage("stageB-hold"), STAGE_B_DURATION_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== "stageB-hold") return;
    const timer = setTimeout(() => setStage("dismissing"), STAGE_B_HOLD_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== "dismissing") return;
    overlayOpacity.value = withTiming(
      0,
      { duration: DISMISS_MS, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) {
          // Wake JS to flip state via runOnJS-free side effect: a setTimeout.
        }
      },
    );
    const timer = setTimeout(() => setStage("gone"), DISMISS_MS + 16);
    return () => clearTimeout(timer);
  }, [stage, overlayOpacity]);

  const handleLayout = useCallback(() => {
    if (nativeHiddenRef.current) return;
    nativeHiddenRef.current = true;
    SplashScreen.hideAsync().catch((error) => {
      Sentry.captureException(error);
    });
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  if (stage === "gone") return null;
  if (!reducedMotionReady) {
    return (
      <Animated.View
        style={[styles.overlay, overlayStyle]}
        onLayout={handleLayout}
        pointerEvents="auto"
      >
        <BackgroundLayer reducedMotion={false} />
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[styles.overlay, overlayStyle]}
      onLayout={handleLayout}
      pointerEvents={stage === "dismissing" ? "none" : "auto"}
    >
      <BackgroundLayer reducedMotion={reducedMotion} />
      <StageA stage={stage} reducedMotion={reducedMotion} />
      <StageB stage={stage} reducedMotion={reducedMotion} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0f172a",
    zIndex: 9999,
    elevation: 9999,
  },
});
