import { Linking, Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";
import type { Id } from "@/convex/_generated/dataModel";
import { PARKEAZ_START_URL, type AutofillValues } from "@/src/parkeaz/pages";
import { shouldLoadRequest } from "@/src/parkeaz/renewFlow";
import { useRenewFlow } from "@/src/hooks/useRenewFlow";
import { RenewBanner } from "@/src/components/renew/RenewBanner";
import { colors } from "@/src/theme";

// Every frame may load (reCAPTCHA iframes); top-frame navigation is gated
// by shouldLoadRequest. Injection is limited to ParkEaz inside useRenewFlow.
const ORIGIN_WHITELIST = ["*"];
const START_SOURCE = { uri: PARKEAZ_START_URL };

function handleShouldStartLoad(request: ShouldStartLoadRequest): boolean {
  const platform = Platform.OS === "android" ? "android" : "ios";
  if (shouldLoadRequest(request, platform) === "allow") return true;
  Linking.openURL(request.url).catch(() => undefined);
  return false;
}

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
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onLoadEnd={webView.onLoadEnd}
        onMessage={webView.onMessage}
        onError={webView.onError}
        onHttpError={webView.onHttpError}
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
