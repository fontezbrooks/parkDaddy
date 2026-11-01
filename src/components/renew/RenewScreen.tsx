import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import type { Id } from "@/convex/_generated/dataModel";
import { PARKEAZ_START_URL, type AutofillValues } from "@/src/parkeaz/pages";
import { useRenewFlow } from "@/src/hooks/useRenewFlow";
import { RenewBanner } from "@/src/components/renew/RenewBanner";
import { colors } from "@/src/theme";

// Navigation stays on ParkEaz and Google's reCAPTCHA hosts; injection is
// further limited to ParkEaz's origin inside useRenewFlow.
const ORIGIN_WHITELIST = [
  "https://paid.parkeaz.com",
  "https://www.google.com",
  "https://www.gstatic.com",
  "https://recaptcha.net",
  "https://www.recaptcha.net",
];
const START_SOURCE = { uri: PARKEAZ_START_URL };

type Props = {
  sessionId: Id<"sessions">;
  values: AutofillValues;
};

export function RenewScreen({ sessionId, values }: Props) {
  const { webView, banner } = useRenewFlow(sessionId, values);

  return (
    <View style={styles.container}>
      <RenewBanner {...banner} />
      <WebView
        key={webView.webViewKey}
        ref={webView.webViewRef}
        source={START_SOURCE}
        originWhitelist={ORIGIN_WHITELIST}
        onLoadEnd={webView.onLoadEnd}
        onMessage={webView.onMessage}
        onError={webView.onError}
        style={styles.webView}
        accessibilityLabel="ParkEaz registration"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  webView: {
    flex: 1,
  },
});
