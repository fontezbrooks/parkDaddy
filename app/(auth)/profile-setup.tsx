import { useState, useCallback } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUser } from "@clerk/clerk-expo";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { router } from "expo-router";
import { colors, typography, spacing, radius } from "@/src/theme";
import { GradientButton } from "@/src/components/GradientButton";

export default function ProfileSetupScreen() {
  const { user } = useUser();
  const upsertProfile = useMutation(api.users.upsertProfile);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState(
    user?.primaryEmailAddress?.emailAddress ?? "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = useCallback(async () => {
    if (!firstName || !lastName || !mobile || !email) {
      setError("All fields are required");
      return;
    }
    setLoading(true);
    setError("");

    try {
      await upsertProfile({ firstName, lastName, email, mobile });
      router.replace("/(tabs)");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setLoading(false);
    }
  }, [firstName, lastName, mobile, email, upsertProfile]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>P</Text>
        </View>
        <Text style={[typography.headlineSm, { color: colors.primary }]}>
          parkDaddy
        </Text>
      </View>

      <Text
        style={[
          typography.headlineLg,
          {
            color: colors.onSurface,
            textAlign: "center",
            marginTop: spacing.lg,
          },
        ]}
      >
        Quick setup
      </Text>
      <Text style={[typography.bodyMd, styles.subtitle]}>
        ParkEaz needs these details to register your guest's vehicle. We never
        share your info.
      </Text>

      <View style={styles.form}>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="First name"
            placeholderTextColor={colors.onSurfaceVariant}
            value={firstName}
            onChangeText={setFirstName}
            textContentType="givenName"
          />
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="Last name"
            placeholderTextColor={colors.onSurfaceVariant}
            value={lastName}
            onChangeText={setLastName}
            textContentType="familyName"
          />
        </View>
        <TextInput
          style={styles.input}
          placeholder="Phone number"
          placeholderTextColor={colors.onSurfaceVariant}
          value={mobile}
          onChangeText={setMobile}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.onSurfaceVariant}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
        />

        {error ? (
          <Text style={[typography.bodySm, { color: colors.secondary }]}>
            {error}
          </Text>
        ) : null}

        <GradientButton
          title={loading ? "Saving..." : "Get Started"}
          onPress={handleSubmit}
          disabled={loading}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  header: {
    alignItems: "center",
    marginTop: spacing["3xl"],
    gap: spacing.sm,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    color: colors.onPrimary,
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    color: colors.onSurfaceVariant,
    textAlign: "center",
    marginTop: spacing.lg,
    marginBottom: spacing["3xl"],
    paddingHorizontal: spacing.lg,
  },
  form: {
    gap: spacing.lg,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: colors.onSurface,
  },
  halfInput: {
    flex: 1,
  },
});
