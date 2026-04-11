import { TextStyle } from "react-native";

export const typography = {
  displayLg: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 48,
    lineHeight: 56,
    letterSpacing: -1,
  } satisfies TextStyle,
  displayMd: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: -0.5,
  } satisfies TextStyle,
  displaySm: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.25,
  } satisfies TextStyle,
  headlineLg: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 24,
    lineHeight: 32,
  } satisfies TextStyle,
  headlineMd: {
    fontFamily: "BricolageGrotesque_600SemiBold",
    fontSize: 20,
    lineHeight: 28,
  } satisfies TextStyle,
  headlineSm: {
    fontFamily: "BricolageGrotesque_600SemiBold",
    fontSize: 18,
    lineHeight: 24,
  } satisfies TextStyle,
  titleLg: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    lineHeight: 24,
  } satisfies TextStyle,
  titleMd: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    lineHeight: 20,
  } satisfies TextStyle,
  bodyLg: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    lineHeight: 24,
  } satisfies TextStyle,
  bodyMd: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 20,
  } satisfies TextStyle,
  bodySm: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 16,
  } satisfies TextStyle,
  labelLg: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.1,
    textTransform: "uppercase",
  } satisfies TextStyle,
  labelMd: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  } satisfies TextStyle,
  labelSm: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  } satisfies TextStyle,
} as const;
