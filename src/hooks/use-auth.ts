import { useConvexAuth } from "convex/react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Convex Auth hook: email OTP
 * - isAuthenticated is driven by Convex session
 * - user exposes minimal info needed by the app
 */
export function useAuth() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const signOutAction = useAction(api.auth.signOut);

  // For Convex Auth, we don't have direct user data in the hook
  // You'll need to fetch it separately if needed
  const user = isAuthenticated ? { email: undefined as string | undefined, theme: null } : undefined;

  return {
    isLoading,
    isAuthenticated,
    user,
    signOut: async () => {
      await signOutAction();
    },
  };
}