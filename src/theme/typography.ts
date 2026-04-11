import { TextStyle } from "react-native";

export const fontFamilies = {
  displayExtraBold: "BricolageGrotesque_800ExtraBold",
  displayBold: "BricolageGrotesque_700Bold",
  displaySemiBold: "BricolageGrotesque_600SemiBold",
  bodyRegular: "Figtree_400Regular",
  bodyMedium: "Figtree_500Medium",
  bodySemiBold: "Figtree_600SemiBold",
  bodyBold: "Figtree_700Bold",
} as const;

export const typography = {
  displayXl: {
    fontFamily: fontFamilies.displayExtraBold,
    fontSize: 64,
    lineHeight: 66,
    letterSpacing: -2,
  } satisfies TextStyle,
  displayLg: {
    fontFamily: fontFamilies.displayExtraBold,
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -1.5,
  } satisfies TextStyle,
  displayMd: {
    fontFamily: fontFamilies.displayBold,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -0.75,
  } satisfies TextStyle,
  displaySm: {
    fontFamily: fontFamilies.displayBold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
  } satisfies TextStyle,
  headlineLg: {
    fontFamily: fontFamilies.displayBold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.25,
  } satisfies TextStyle,
  headlineMd: {
    fontFamily: fontFamilies.displaySemiBold,
    fontSize: 20,
    lineHeight: 26,
  } satisfies TextStyle,
  headlineSm: {
    fontFamily: fontFamilies.displaySemiBold,
    fontSize: 18,
    lineHeight: 24,
  } satisfies TextStyle,
  titleLg: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 16,
    lineHeight: 22,
  } satisfies TextStyle,
  titleMd: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
  } satisfies TextStyle,
  bodyLg: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 17,
    lineHeight: 26,
  } satisfies TextStyle,
  bodyMd: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 15,
    lineHeight: 22,
  } satisfies TextStyle,
  bodySm: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 13,
    lineHeight: 18,
  } satisfies TextStyle,
  labelLg: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  } satisfies TextStyle,
  labelMd: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  } satisfies TextStyle,
  labelSm: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  } satisfies TextStyle,
  fieldLabel: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.1,
  } satisfies TextStyle,
} as const;
