import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Tabs } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/theme";

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: "H",
    History: "Hi",
    Settings: "S",
  };

  return (
    <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
      <Text
        style={[
          styles.iconText,
          { color: focused ? colors.primary : colors.onSurfaceVariant },
        ]}
      >
        {icons[name] ?? "?"}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const profile = useQuery(api.users.getProfile);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/welcome" />;
  if (profile === null) return <Redirect href="/(auth)/profile-setup" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.surfaceContainerHigh,
        },
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 10,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="Home" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="History" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="Settings" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  iconContainerActive: {
    opacity: 1,
  },
  iconText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
