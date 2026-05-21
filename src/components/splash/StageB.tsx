import { useEffect } from "react";
import { Image, StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { SplashStage } from "./AnimatedSplash";

type Props = {
  stage: SplashStage;
  reducedMotion: boolean;
};

const LOGO_SIZE = 200;

const EASE_OUT = Easing.out(Easing.cubic);
const EASE_OUT_BACK = Easing.out(Easing.back(1.2));

export function StageB({ stage, reducedMotion }: Props) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.6);

  useEffect(() => {
    if (stage !== "stageB" && stage !== "stageB-hold" && stage !== "dismissing") {
      return;
    }
    if (reducedMotion) {
      opacity.value = withTiming(1, { duration: 200, easing: Easing.linear });
      scale.value = 1;
      return;
    }
    opacity.value = withTiming(1, { duration: 600, easing: EASE_OUT });
    scale.value = withTiming(1, { duration: 800, easing: EASE_OUT_BACK });
  }, [stage, reducedMotion, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.container, animatedStyle]} pointerEvents="none">
      <Image
        source={require("../../../assets/parkDaddy-splash.png")}
        style={styles.logo}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
});
