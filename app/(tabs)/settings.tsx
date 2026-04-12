import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Pressable,
  FlatList,
  Alert,
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
  const [signingOut, setSigningOut] = useState(false);

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
  const profile = useQuery(api.users.getProfile);
  const vehicles = useQuery(api.vehicles.list) ?? [];
  const updatePrefs = useMutation(api.users.updateNotificationPrefs);
  const deleteVehicle = useMutation(api.vehicles.remove);
  const { user: clerkUser } = useUser();
  const deleteAccountMutation = useMutation(api.users.deleteAccount);
  const activeSession = useQuery(api.sessions.getActive);
  const [deleting, setDeleting] = useState(false);

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

  const appVersion = Constants.expoConfig?.version ?? "2.0.0";

  return (
    <SafeAreaView style={styles.container}>
      <Text
        style={[
          typography.headlineLg,
          {
            color: colors.onSurface,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
          },
        ]}
      >
        Settings
      </Text>

      <View style={styles.content}>
        {/* Profile Section */}
        <SurfaceCard level={2}>
          <Text style={[typography.labelMd, styles.sectionTitle]}>PROFILE</Text>
          {profile && (
            <View style={styles.profileInfo}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {profile.firstName[0]}
                  {profile.lastName?.[0] ?? ""}
                </Text>
              </View>
              <View>
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
          )}
        </SurfaceCard>

        {/* Vehicles Section */}
        <SurfaceCard level={2}>
          <Text style={[typography.labelMd, styles.sectionTitle]}>
            SAVED VEHICLES
          </Text>
          {vehicles.length === 0 ? (
            <Text
              style={[typography.bodySm, { color: colors.onSurfaceVariant }]}
            >
              No saved vehicles yet
            </Text>
          ) : (
            <FlatList
              data={vehicles}
              keyExtractor={(item) => item._id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.vehicleRow}>
                  <Text style={[typography.titleLg, { color: colors.primary }]}>
                    {item.plate}
                  </Text>
                  <Pressable
                    onPress={() => deleteVehicle({ vehicleId: item._id })}
                  >
                    <Text
                      style={[typography.bodySm, { color: colors.secondary }]}
                    >
                      Remove
                    </Text>
                  </Pressable>
                </View>
              )}
              ItemSeparatorComponent={() => (
                <View style={{ height: spacing.sm }} />
              )}
            />
          )}
        </SurfaceCard>

        {/* Notifications Section */}
        {profile && (
          <SurfaceCard level={2}>
            <Text style={[typography.labelMd, styles.sectionTitle]}>
              NOTIFICATIONS
            </Text>
            <View style={styles.toggleRow}>
              <Text style={[typography.bodyMd, { color: colors.onSurface }]}>
                Expiry Warnings
              </Text>
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
              <Text style={[typography.bodyMd, { color: colors.onSurface }]}>
                Renewal Success Alerts
              </Text>
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
          </SurfaceCard>
        )}

        {/* App Info */}
        <SurfaceCard level={2}>
          <Text style={[typography.bodySm, { color: colors.onSurfaceVariant }]}>
            parkDaddy Mobile · v{appVersion}
          </Text>
        </SurfaceCard>

        {/* Sign Out */}
        <Pressable onPress={handleSignOut} style={styles.signOutButton}>
          <Text style={[typography.titleLg, { color: colors.secondary }]}>
            {signingOut ? "Signing out..." : "Sign Out"}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleDeleteAccount}
          disabled={deleting}
          style={styles.deleteButton}
        >
          <Text style={[typography.bodySm, { color: colors.secondary }]}>
            {deleting ? "Deleting account..." : "Delete account"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  sectionTitle: {
    color: colors.onSurfaceVariant,
    marginBottom: spacing.md,
  },
  profileInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
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
    fontFamily: "Inter_600SemiBold",
  },
  vehicleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  signOutButton: {
    alignItems: "center",
    paddingVertical: spacing.lg,
  },
  deleteButton: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
});
