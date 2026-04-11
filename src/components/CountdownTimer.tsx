import { useState, useEffect } from "react";
import { Text, StyleSheet, TextStyle } from "react-native";
import { colors, typography } from "@/src/theme";

type Props = {
  targetTime: number;
  style?: TextStyle;
  variant?: "large" | "medium";
  showSeconds?: boolean;
};

function formatTime(ms: number, showSeconds: boolean): string {
  if (ms <= 0) return showSeconds ? "00:00:00" : "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  if (!showSeconds) return `${hh}:${mm}`;
  const ss = String(seconds).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function CountdownTimer({
  targetTime,
  style,
  variant = "large",
  showSeconds = true,
}: Props) {
  const [remaining, setRemaining] = useState(targetTime - Date.now());

  useEffect(() => {
    // 1s tick when showing seconds, 15s tick otherwise
    const tickMs = showSeconds ? 1000 : 15000;
    const interval = setInterval(() => {
      setRemaining(targetTime - Date.now());
    }, tickMs);
    return () => clearInterval(interval);
  }, [targetTime, showSeconds]);

  const textStyle =
    variant === "large" ? typography.displayLg : typography.displaySm;

  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      style={[textStyle, styles.timer, remaining <= 0 && styles.expired, style]}
    >
      {formatTime(remaining, showSeconds)}
    </Text>
  );
}

const styles = StyleSheet.create({
  timer: {
    color: colors.onPrimary,
    fontVariant: ["tabular-nums"],
    textAlign: "left",
  },
  expired: {
    color: colors.secondary,
  },
});
