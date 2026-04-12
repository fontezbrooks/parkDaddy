import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Pressable,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { router } from "expo-router";
import Constants from "expo-constants";
import { colors, typography, spacing } from "@/src/theme";
import { SurfaceCard } from "@/src/components/SurfaceCard";

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const { user: clerkUser } = useUser();
  const profile = useQuery(api.users.getProfile);
  const vehicles = useQuery(api.vehicles.list) ?? [];
  const updatePrefs = useMutation(api.users.updateNotificationPrefs);
  const deleteVehicle = useMutation(api.vehicles.remove);
  const deleteAccountMutation = useMutation(api.users.deleteAccount);
  const activeSession = useQuery(api.sessions.getActive);

  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? "2.0.0";

  const handleSignOut = () => {
    Alert.alert("Sign out?", "You can always sign back in.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          setSigningOut(true);
          await signOut();
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    const hasActive = activeSession != null;
    const body = hasActive
      ? "This will cancel your active parking session and permanently delete your account and all data. This can't be undone."
      : "This will permanently delete your account and all data. This can't be undone.";

    Alert.alert("Delete your account?", body, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete my account",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteAccountMutation();
            await clerkUser?.delete();
            router.replace("/(auth)/welcome");
          } catch (err: unknown) {
            setDeleting(false);
            Alert.alert(
              "Couldn't delete account",
              err instanceof Error
                ? err.message
                : "Something went wrong. Try again.",
            );
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[typography.labelSm, styles.kicker]}>Your stuff</Text>
        <Text style={[typography.displaySm, styles.heading]}>Settings</Text>

        {/* Profile */}
        {profile && (
          <SurfaceCard level={2} style={styles.profileCard}>
            <View style={styles.profileInfo}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {profile.firstName[0]}
                  {profile.lastName?.[0] ?? ""}
                </Text>
              </View>
              <View style={styles.profileDetails}>
                <Text style={[typography.titleLg, { color: colors.onSurface }]}>
                  {profile.firstName} {profile.lastName}
                </Text>
                <Text
                  style={[
                    typography.bodySm,
                    { color: colors.onSurfaceVariant },
                  ]}
                >
                  {profile.email}
                </Text>
                <Text
                  style={[
                    typography.bodySm,
                    { color: colors.onSurfaceVariant },
                  ]}
                >
                  {profile.mobile}
                </Text>
              </View>
            </View>
          </SurfaceCard>
        )}

        {/* Vehicles */}
        <View style={styles.section}>
          <Text style={[typography.headlineSm, styles.sectionTitle]}>
            Saved vehicles
          </Text>
          {vehicles.length === 0 ? (
            <Text
              style={[typography.bodySm, { color: colors.onSurfaceVariant }]}
            >
              No saved vehicles yet
            </Text>
          ) : (
            vehicles.map((item) => (
              <View key={item._id} style={styles.vehicleRow}>
                <Text style={[typography.titleLg, { color: colors.primary }]}>
                  {item.plate}
                </Text>
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      `Remove ${item.plate}?`,
                      "This won't affect active parking sessions.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Remove",
                          style: "destructive",
                          onPress: () =>
                            deleteVehicle({ vehicleId: item._id }),
                        },
                      ],
                    );
                  }}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.plate}`}
                >
                  <Text
                    style={[
                      typography.bodySm,
                      { color: colors.onSurfaceMuted },
                    ]}
                  >
                    Remove
                  </Text>
                </Pressable>
              </View>
            ))
          )}
        </View>

        {/* Notifications */}
        {profile && (
          <View style={styles.section}>
            <Text style={[typography.headlineSm, styles.sectionTitle]}>
              Notifications
            </Text>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={[typography.bodyMd, { color: colors.onSurface }]}>
                  Expiry warnings
                </Text>
                <Text
                  style={[
                    typography.bodySm,
                    { color: colors.onSurfaceMuted },
                  ]}
                >
                  15 minutes before parking expires
                </Text>
              </View>
              <Switch
                value={profile.notifyOnExpiry}
                onValueChange={(val: boolean) => {
                  void updatePrefs({
                    notifyOnExpiry: val,
                    notifyOnSuccess: profile.notifyOnSuccess,
                  });
                }}
                trackColor={{
                  false: colors.surfaceContainerHigh,
                  true: colors.tertiary,
                }}
              />
            </View>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={[typography.bodyMd, { color: colors.onSurface }]}>
                  Renewal alerts
                </Text>
                <Text
                  style={[
                    typography.bodySm,
                    { color: colors.onSurfaceMuted },
                  ]}
                >
                  When auto-renewal succeeds
                </Text>
              </View>
              <Switch
                value={profile.notifyOnSuccess}
                onValueChange={(val: boolean) => {
                  void updatePrefs({
                    notifyOnExpiry: profile.notifyOnExpiry,
                    notifyOnSuccess: val,
                  });
                }}
                trackColor={{
                  false: colors.surfaceContainerHigh,
                  true: colors.tertiary,
                }}
              />
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Pressable
            onPress={handleSignOut}
            style={styles.signOutButton}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Text
              style={[
                typography.bodyMd,
                { color: colors.onSurfaceVariant },
              ]}
            >
              {signingOut ? "Signing out..." : "Sign out"}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleDeleteAccount}
            disabled={deleting}
            style={styles.deleteButton}
            accessibilityRole="button"
            accessibilityLabel="Delete account"
          >
            <Text style={[typography.bodySm, { color: colors.secondary }]}>
              {deleting ? "Deleting account..." : "Delete account"}
            </Text>
          </Pressable>

          <Text style={[typography.bodySm, styles.version]}>
            parkDaddy Mobile · v{appVersion}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scroll: {
    paddingHorizontal: spacing["2xl"],
    paddingBottom: spacing["3xl"],
  },
  kicker: {
    color: colors.accent,
    marginTop: spacing["2xl"],
  },
  heading: {
    color: colors.primary,
    marginTop: spacing.sm,
    marginBottom: spacing["2xl"],
  },
  profileCard: {
    marginBottom: spacing.md,
  },
  profileInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  profileDetails: {
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.onPrimary,
    fontSize: 18,
    fontFamily: "Figtree_600SemiBold",
  },
  section: {
    paddingTop: spacing["2xl"],
  },
  sectionTitle: {
    color: colors.onSurface,
    marginBottom: spacing.lg,
  },
  vehicleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  toggleInfo: {
    flex: 1,
    marginRight: spacing.lg,
  },
  footer: {
    marginTop: spacing["4xl"],
    alignItems: "center",
    gap: spacing.lg,
    paddingBottom: spacing.lg,
  },
  signOutButton: {
    paddingVertical: spacing.md,
  },
  deleteButton: {
    paddingVertical: spacing.sm,
  },
  version: {
    color: colors.onSurfaceMuted,
    marginTop: spacing.md,
  },
});
