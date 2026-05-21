import { useAuth } from "@clerk/clerk-expo";
import { useConvexAuth } from "convex/react";

type Args = {
  fontsLoaded: boolean;
  fontError: Error | null;
};

export function useAppReady({ fontsLoaded, fontError }: Args): boolean {
  const { isLoaded: clerkLoaded } = useAuth();
  const { isLoading: convexLoading } = useConvexAuth();

  const fontsReady = fontsLoaded || fontError !== null;
  return fontsReady && clerkLoaded && !convexLoading;
}
