import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Tabs } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const TAB_ICONS: Record<string, { outline: IconName; filled: IconName }> = {
  Home: { outline: "home-outline", filled: "home" },
  History: { outline: "time-outline", filled: "time" },
  Settings: { outline: "settings-outline", filled: "settings" },
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const config = TAB_ICONS[name];
  if (!config) return null;
  return (
    <Ionicons
      name={focused ? config.filled : config.outline}
      size={22}
      color={focused ? colors.primary : colors.onSurfaceVariant}
    />
  );
}

export default function TabsLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const profile = useQuery(api.users.getProfile);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/welcome" />;
  // undefined = query still loading, null = no profile exists
  if (profile === undefined) return null;
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
          fontFamily: "Figtree_500Medium",
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
