import { useEffect } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Defs,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

type Props = {
  reducedMotion: boolean;
};

const ORB_SIZE = 384;
const SCREEN = Dimensions.get("window");

export function BackgroundLayer({ reducedMotion }: Props) {
  const orbAScale = useSharedValue(1);
  const orbAOpacity = useSharedValue(0.3);
  const orbBScale = useSharedValue(1.2);
  const orbBOpacity = useSharedValue(0.5);

  useEffect(() => {
    if (reducedMotion) return;

    orbAScale.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    orbAOpacity.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    orbBScale.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.2, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    orbBOpacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.5, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [reducedMotion, orbAScale, orbAOpacity, orbBScale, orbBOpacity]);

  const orbAStyle = useAnimatedStyle(() => ({
    opacity: orbAOpacity.value,
    transform: [{ scale: orbAScale.value }],
  }));
  const orbBStyle = useAnimatedStyle(() => ({
    opacity: orbBOpacity.value,
    transform: [{ scale: orbBScale.value }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={["#020617", "#0f172a", "#020617"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        style={[
          styles.orb,
          {
            top: SCREEN.height * 0.25 - ORB_SIZE / 2,
            left: SCREEN.width * 0.25 - ORB_SIZE / 2,
          },
          orbAStyle,
        ]}
      >
        <Svg width={ORB_SIZE} height={ORB_SIZE}>
          <Defs>
            <RadialGradient
              id="orbAGradient"
              cx="50%"
              cy="50%"
              r="50%"
              fx="50%"
              fy="50%"
            >
              <Stop offset="0%" stopColor="#10b981" stopOpacity="1" />
              <Stop offset="60%" stopColor="#14b8a6" stopOpacity="0.5" />
              <Stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect width={ORB_SIZE} height={ORB_SIZE} fill="url(#orbAGradient)" />
        </Svg>
      </Animated.View>
      <Animated.View
        style={[
          styles.orb,
          {
            bottom: SCREEN.height * 0.25 - ORB_SIZE / 2,
            right: SCREEN.width * 0.25 - ORB_SIZE / 2,
          },
          orbBStyle,
        ]}
      >
        <Svg width={ORB_SIZE} height={ORB_SIZE}>
          <Defs>
            <RadialGradient
              id="orbBGradient"
              cx="50%"
              cy="50%"
              r="50%"
              fx="50%"
              fy="50%"
            >
              <Stop offset="0%" stopColor="#06b6d4" stopOpacity="1" />
              <Stop offset="60%" stopColor="#3b82f6" stopOpacity="0.5" />
              <Stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect width={ORB_SIZE} height={ORB_SIZE} fill="url(#orbBGradient)" />
        </Svg>
      </Animated.View>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <Pattern
            id="grid"
            x="0"
            y="0"
            width="50"
            height="50"
            patternUnits="userSpaceOnUse"
          >
            <Rect
              x="0"
              y="0"
              width="50"
              height="1"
              fill="#ffffff"
              opacity="0.02"
            />
            <Rect
              x="0"
              y="0"
              width="1"
              height="50"
              fill="#ffffff"
              opacity="0.02"
            />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#grid)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  orb: {
    position: "absolute",
    width: ORB_SIZE,
    height: ORB_SIZE,
  },
});
