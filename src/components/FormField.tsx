import { forwardRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  TextInputProps,
  ViewStyle,
} from "react-native";
import { colors, typography, spacing, radius } from "@/src/theme";

type Props = TextInputProps & {
  label: string;
  error?: string;
  trailing?: React.ReactNode;
  containerStyle?: ViewStyle;
};

export const FormField = forwardRef<TextInput, Props>(function FormField(
  { label, error, trailing, containerStyle, onFocus, onBlur, style, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const hasError = Boolean(error);

  return (
    <View style={containerStyle}>
      <Text
        style={[
          typography.fieldLabel,
          styles.label,
          hasError && styles.labelError,
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.inputWrap,
          focused && styles.inputWrapFocused,
          hasError && styles.inputWrapError,
        ]}
      >
        <TextInput
          ref={ref}
          style={[styles.input, style]}
          placeholderTextColor={colors.onSurfaceMuted}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
      {hasError ? (
        <Text style={[typography.bodySm, styles.errorText]}>{error}</Text>
      ) : null}
    </View>
  );
});

type ToggleProps = {
  visible: boolean;
  onToggle: () => void;
};

export function PasswordToggle({ visible, onToggle }: ToggleProps) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={visible ? "Hide password" : "Show password"}
    >
      <Text style={[typography.labelSm, styles.toggle]}>
        {visible ? "Hide" : "Show"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.onSurfaceVariant,
    marginBottom: spacing.xs + 2,
  },
  labelError: {
    color: colors.error,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: "transparent",
    paddingHorizontal: spacing.lg,
  },
  inputWrapFocused: {
    borderColor: colors.focus,
  },
  inputWrapError: {
    borderColor: colors.error,
    backgroundColor: colors.errorContainer,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md + 2,
    fontSize: 16,
    fontFamily: "Figtree_400Regular",
    color: colors.onSurface,
  },
  trailing: {
    marginLeft: spacing.sm,
  },
  toggle: {
    color: colors.primary,
  },
  errorText: {
    color: colors.error,
    marginTop: spacing.xs,
  },
});
