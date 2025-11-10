import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { LogoDropdown } from "@/components/LogoDropdown";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { WifiOff, Loader2 } from "lucide-react";
import { useNavigate } from 'react-router';
import { useEffect } from 'react';
import { SAPJsonCard } from "@/components/SAPJsonCard";
import { supabase, hasSupabaseEnv } from "@/lib/supabase";

export default function Landing() {
  const { isLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [sapData, setSapData] = useState<any | null>(null);
  const [sapLoading, setSapLoading] = useState<boolean>(false);
  const [sapError, setSapError] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // Auto-load latest SAP data on mount if Supabase is configured
  useEffect(() => {
    if (hasSupabaseEnv) {
      void loadLatestSap();
    }
  }, []);

  const loadLatestSap = async () => {
    try {
      setSapError(null);
      setSapLoading(true);
      setSapData(null);

      if (!hasSupabaseEnv) {
        setSapError("Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the API keys tab.");
        return;
      }

      const { data, error } = await supabase
        .from("documents")
        .select("document_data")
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        setSapError(error.message || "Failed to load SAP data.");
        return;
      }

      const doc = (data && data[0]) || null;
      if (!doc || !doc.document_data) {
        setSapError("No SAP data found in the latest document.");
        return;
      }

      setSapData(doc.document_data);
    } catch (e: any) {
      setSapError(e?.message || "Failed to load SAP data.");
    } finally {
      setSapLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {!isOnline && (
        <div className="max-w-2xl w-full mx-auto mb-6">
          <Alert variant="destructive">
            <AlertTitle>Offline</AlertTitle>
            <AlertDescription>
              You're currently offline. Some data may not load until your connection is restored.
            </AlertDescription>
          </Alert>
        </div>
      )}

      <header className="sticky top-0 z-50 border-b bg-background/60 supports-[backdrop-filter]:bg-background/60 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Logo" className="h-8 w-8" loading="lazy" decoding="async" />
            <span className="text-xl font-bold tracking-tight">DocuVision</span>
          </div>
          <div className="flex items-center gap-3">
            {isAuthenticated && user && (
              <LogoDropdown />
            )}
            <Button
              asChild
              size="lg"
              onClick={() => {
                if (isAuthenticated) {
                  navigate('/dashboard');
                } else {
                  navigate('/auth');
                }
              }}
              disabled={isLoading}
              className="bg-white/5 hover:bg-white/10 border-white/20 supports-[backdrop-filter]:bg-white/5 backdrop-blur"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isAuthenticated ? (
                'Dashboard'
              ) : (
                'Sign In'
              )}
            </Button>
          </div>
        </div>
      </header>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="container mx-auto px-4 py-20 text-center"
      >
        <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
          Doc Dashboard
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Manage your SAP documents with ease. View, edit, and organize your document data in one place.
        </p>
        <div className="flex gap-4 justify-center">
          {isAuthenticated ? (
            <Button asChild size="lg">
              <Link to="/dashboard">Go to Dashboard</Link>
            </Button>
          ) : (
            <Button asChild size="lg">
              <Link to="/auth">Get Started</Link>
            </Button>
          )}
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="container mx-auto px-4 pb-16"
      >
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">SAP Output</h2>
            <Button
              size="sm"
              onClick={loadLatestSap}
              disabled={sapLoading}
              className="gap-2"
              title="Load latest document's SAP data"
            >
              {sapLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {sapLoading ? "Loading..." : "Load Latest"}
            </Button>
          </div>

          {!hasSupabaseEnv && (
            <Alert variant="destructive">
              <AlertTitle>Supabase not configured</AlertTitle>
              <AlertDescription>
                Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the API keys tab to fetch SAP data.
              </AlertDescription>
            </Alert>
          )}

          {sapError && (
            <Alert variant="destructive">
              <AlertTitle>Unable to load</AlertTitle>
              <AlertDescription>{sapError}</AlertDescription>
            </Alert>
          )}

          {sapData ? (
            <SAPJsonCard
              data={sapData}
              title="SAP Output"
              defaultCollapsed={false}
            />
          ) : (
            <div className="text-sm text-muted-foreground">
              Click "Load Latest" to view the latest document's SAP output.
            </div>
          )}
        </div>
      </motion.section>
    </div>
  );
}