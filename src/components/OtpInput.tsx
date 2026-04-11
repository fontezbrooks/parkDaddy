import { useEffect, useRef } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from "react-native";
import { colors, spacing, radius } from "@/src/theme";

type Props = {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: boolean;
  autoFocus?: boolean;
};

export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  error,
  autoFocus = true,
}: Props) {
  const refs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    if (autoFocus) {
      const timer = setTimeout(() => refs.current[0]?.focus(), 200);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  useEffect(() => {
    if (value.length === length) onComplete?.(value);
  }, [value, length, onComplete]);

  const handleChange = (text: string, index: number) => {
    // iOS SMS autofill can deliver the full code into one cell
    const cleaned = text.replace(/\D/g, "");
    if (cleaned.length >= length) {
      onChange(cleaned.slice(0, length));
      refs.current[length - 1]?.blur();
      return;
    }
    const chars = value.split("");
    chars[index] = cleaned.slice(-1) ?? "";
    const next = chars.join("").slice(0, length);
    onChange(next);
    if (cleaned && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const handleKey = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number,
  ) => {
    if (e.nativeEvent.key === "Backspace" && !value[index] && index > 0) {
      refs.current[index - 1]?.focus();
      const chars = value.split("");
      chars[index - 1] = "";
      onChange(chars.join(""));
    }
  };

  return (
    <View style={styles.row}>
      {Array.from({ length }).map((_, i) => (
        <TextInput
          key={i}
          ref={(r) => {
            refs.current[i] = r;
          }}
          value={value[i] ?? ""}
          onChangeText={(t) => handleChange(t, i)}
          onKeyPress={(e) => handleKey(e, i)}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={length}
          style={[
            styles.cell,
            value[i] && styles.cellFilled,
            error && styles.cellError,
          ]}
          selectTextOnFocus
          accessibilityLabel={`Verification digit ${i + 1}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  cell: {
    flex: 1,
    aspectRatio: 0.85,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: "transparent",
    backgroundColor: colors.surfaceContainerLowest,
    textAlign: "center",
    fontSize: 24,
    fontFamily: "BricolageGrotesque_700Bold",
    color: colors.primary,
  },
  cellFilled: {
    borderColor: colors.primary,
  },
  cellError: {
    borderColor: colors.error,
    backgroundColor: colors.errorContainer,
  },
});
