import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { AutofillValues } from "@/src/parkeaz/pages";
import { parseRenewParams } from "@/src/parkeaz/renewFlow";
import { RenewScreen } from "@/src/components/renew/RenewScreen";
import {
  digitsOnly,
  GUEST_CODE_UNAVAILABLE_MESSAGE,
} from "@/src/domain/renewal";
import { colors, spacing, typography } from "@/src/theme";

type ActiveSession = NonNullable<
  ReturnType<typeof useQuery<typeof api.sessions.getActive>>
>;

function toAutofillValues(
  session: ActiveSession,
  guestCode: string,
): AutofillValues {
  return {
    plate: session.plate,
    mobile: digitsOnly(session.mobile),
    email: session.email,
    firstName: session.firstName,
    lastName: session.lastName,
    guestCode,
  };
}

export default function RenewRoute() {
  const sessionId = parseRenewParams(useLocalSearchParams());
  const session = useQuery(api.sessions.getActive);
  // Property-wide code from the Convex env; null means unset or malformed.
  const guestCode = useQuery(api.config.getGuestCode);
  const values = useMemo(
    () => (session && guestCode ? toAutofillValues(session, guestCode) : null),
    [session, guestCode],
  );

  if (!sessionId) return <Redirect href="/(tabs)" />;
  if (session === undefined || guestCode === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator
          color={colors.primary}
          accessibilityLabel="Loading session"
        />
      </View>
    );
  }
  // The ParkEaz form cannot submit without the code; never open it blind.
  if (guestCode === null) {
    return (
      <View style={styles.loading} accessibilityRole="alert">
        <Text style={[typography.bodyMd, styles.unavailable]}>
          {GUEST_CODE_UNAVAILABLE_MESSAGE}
        </Text>
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
    padding: spacing.lg,
  },
  unavailable: {
    color: colors.onSurface,
    textAlign: "center",
  },
});
