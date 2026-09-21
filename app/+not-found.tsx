// Replaces Expo Router's default "Unmatched Route" screen so unknown deep links
// never show error-looking text. "/" resolves to (tabs)/index, whose layout
// guards redirect unauthenticated users to the auth flow.
import { StyleSheet, View } from "react-native";
import { Redirect } from "expo-router";

export default function NotFound() {
  return (
    <View style={styles.container}>
      <Redirect href="/" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
});
