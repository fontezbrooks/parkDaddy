import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

type Props = {
  reducedMotion: boolean;
};

const DOT_COLORS = ["#34d399", "#22d3ee", "#60a5fa"] as const;
const STAGGER_MS = [0, 200, 400] as const;

export function PulsingDots({ reducedMotion }: Props) {
  return (
    <View style={styles.row}>
      {DOT_COLORS.map((color, i) => (
        <Dot
          key={color}
          color={color}
          delay={STAGGER_MS[i]}
          reducedMotion={reducedMotion}
        />
      ))}
    </View>
  );
}

function Dot({
  color,
  delay,
  reducedMotion,
}: {
  color: string;
  delay: number;
  reducedMotion: boolean;
}) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) return;
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.3, { duration: 750, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 750, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, reducedMotion, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[styles.dot, { backgroundColor: color }, animatedStyle]}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
