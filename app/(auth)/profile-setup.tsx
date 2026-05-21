import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUser } from "@clerk/clerk-expo";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { router } from "expo-router";
import { colors, typography, spacing } from "@/src/theme";
import { GradientButton } from "@/src/components/GradientButton";
import { FormField } from "@/src/components/FormField";

export default function ProfileSetupScreen() {
  const { user, isLoaded } = useUser();
  const upsertProfile = useMutation(api.users.upsertProfile);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !isLoaded || !user) return;
    prefilled.current = true;
    if (user.firstName) setFirstName(user.firstName);
    if (user.lastName) setLastName(user.lastName);
    const clerkEmail = user.primaryEmailAddress?.emailAddress;
    if (clerkEmail) setEmail(clerkEmail);
  }, [isLoaded, user]);

  // SSO users (Apple/Google) already have name + email from identity provider
  const hasSsoProfile =
    isLoaded &&
    Boolean(
      user?.firstName &&
      user?.lastName &&
      user?.primaryEmailAddress?.emailAddress,
    );

  const lastNameRef = useRef<TextInput>(null);
  const mobileRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);

  const handleSubmit = useCallback(async () => {
    if (!firstName || !lastName || !mobile || !email) {
      setError(
        hasSsoProfile
          ? "Enter your phone number to continue."
          : "Fill in all fields to continue.",
      );
      return;
    }
    setLoading(true);
    setError("");

    try {
      await upsertProfile({ firstName, lastName, email, mobile });
      router.replace("/(tabs)");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Couldn't save your profile.",
      );
    } finally {
      setLoading(false);
    }
  }, [firstName, lastName, mobile, email, upsertProfile, hasSsoProfile]);

  if (!isLoaded) return null;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[typography.labelSm, styles.kicker]}>
            {hasSsoProfile ? "One more thing" : "Almost there"}
          </Text>
          <Text style={[typography.displaySm, styles.title]}>
            {hasSsoProfile ? "Your phone number." : "A couple details."}
          </Text>
          <Text style={[typography.bodyLg, styles.subtitle]}>
            {hasSsoProfile
              ? "ParkEaz needs this to register your car. Never shared."
              : "We use these to register vehicles  with ParkEaz. Never shared."}
          </Text>

          <View style={styles.form}>
            {!hasSsoProfile && (
              <View style={styles.row}>
                <FormField
                  label="First name"
                  value={firstName}
                  onChangeText={setFirstName}
                  textContentType="givenName"
                  autoComplete="given-name"
                  returnKeyType="next"
                  onSubmitEditing={() => lastNameRef.current?.focus()}
                  blurOnSubmit={false}
                  containerStyle={styles.half}
                />
                <FormField
                  ref={lastNameRef}
                  label="Last name"
                  value={lastName}
                  onChangeText={setLastName}
                  textContentType="familyName"
                  autoComplete="family-name"
                  returnKeyType="next"
                  onSubmitEditing={() => mobileRef.current?.focus()}
                  blurOnSubmit={false}
                  containerStyle={styles.half}
                />
              </View>
            )}

            <FormField
              ref={mobileRef}
              label="Phone number"
              value={mobile}
              onChangeText={setMobile}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              returnKeyType={hasSsoProfile ? "go" : "next"}
              onSubmitEditing={
                hasSsoProfile ? handleSubmit : () => emailRef.current?.focus()
              }
              blurOnSubmit={hasSsoProfile}
              placeholder="(555) 123-4567"
            />

            {!hasSsoProfile && (
              <FormField
                ref={emailRef}
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
              />
            )}

            {error ? (
              <View style={styles.errorBox}>
                <Text style={[typography.bodySm, styles.errorText]}>
                  {error}
                </Text>
              </View>
            ) : null}

            <GradientButton
              title={loading ? "Saving…" : "Finish setup"}
              onPress={handleSubmit}
              disabled={loading}
              loading={loading}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  kav: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing["2xl"],
    paddingBottom: spacing["3xl"],
  },
  kicker: {
    color: colors.accent,
    marginTop: spacing["2xl"],
  },
  title: {
    color: colors.onSurface,
    marginTop: spacing.sm,
  },
  subtitle: {
    color: colors.onSurfaceVariant,
    marginTop: spacing.sm,
    marginBottom: spacing["2xl"],
  },
  form: {
    gap: spacing.lg,
  },
  row: {
    flexDirection: "row",
    gap: spacing.md,
  },
  half: {
    flex: 1,
  },
  errorBox: {
    backgroundColor: colors.errorContainer,
    padding: spacing.md,
    borderRadius: 8,
  },
  errorText: {
    color: colors.error,
  },
});
