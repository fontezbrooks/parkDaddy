import { useState, useEffect } from "react";
import { Text, StyleSheet, TextStyle } from "react-native";
import { colors, typography } from "@/src/theme";

type Props = {
  targetTime: number;
  style?: TextStyle;
  variant?: "large" | "medium";
};

function formatTime(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function CountdownTimer({
  targetTime,
  style,
  variant = "large",
}: Props) {
  const [remaining, setRemaining] = useState(targetTime - Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(targetTime - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  const textStyle =
    variant === "large" ? typography.displayLg : typography.displaySm;

  return (
    <Text
      style={[
        textStyle,
        styles.timer,
        remaining <= 0 && styles.expired,
        style,
      ]}
    >
      {formatTime(remaining)}
    </Text>
  );
}

const styles = StyleSheet.create({
  timer: {
    color: colors.onPrimary,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  expired: {
    color: colors.secondary,
  },
});
