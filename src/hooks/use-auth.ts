import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

/**
 * Supabase-based auth hook: email + password
 * - isAuthenticated is driven by Supabase session
 * - user exposes minimal info needed by the app (email + optional theme)
 */
export function useAuth() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{ email?: string; theme?: string | null } | undefined>(undefined);

  useEffect(() => {
    let mounted = true;

    // Initial session load
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const session = data?.session ?? null;
      setIsAuthenticated(Boolean(session));
      setUser(session?.user ? { email: session.user.email ?? undefined, theme: null } : undefined);
      setIsLoading(false);
    });

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
      setUser(session?.user ? { email: session.user.email ?? undefined, theme: null } : undefined);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return {
    isLoading,
    isAuthenticated,
    user,
    signIn,
    signUp,
    signOut,
  };
}