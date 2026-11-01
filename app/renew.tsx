import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { AutofillValues } from "@/src/parkeaz/pages";
import { parseRenewParams } from "@/src/parkeaz/renewFlow";
import { RenewScreen } from "@/src/components/renew/RenewScreen";
import { colors } from "@/src/theme";

type ActiveSession = NonNullable<
  ReturnType<typeof useQuery<typeof api.sessions.getActive>>
>;
type Profile = ReturnType<typeof useQuery<typeof api.users.getProfile>>;

function toAutofillValues(
  session: ActiveSession,
  profile: Profile,
): AutofillValues {
  return {
    plate: session.plate,
    mobile: session.mobile,
    email: session.email,
    firstName: session.firstName,
    lastName: session.lastName,
    guestCode: profile?.guestCode ?? "",
  };
}

export default function RenewRoute() {
  const sessionId = parseRenewParams(useLocalSearchParams());
  const session = useQuery(api.sessions.getActive);
  const profile = useQuery(api.users.getProfile);
  const values = useMemo(
    () => (session ? toAutofillValues(session, profile) : null),
    [session, profile],
  );

  if (!sessionId) return <Redirect href="/(tabs)" />;
  if (session === undefined || profile === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator
          color={colors.primary}
          accessibilityLabel="Loading session"
        />
      </View>
    );
  }
  if (!session || session._id !== sessionId || !values) {
    return <Redirect href="/(tabs)" />;
  }
  return <RenewScreen sessionId={session._id} values={values} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
});
