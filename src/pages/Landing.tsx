import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { LogoDropdown } from "@/components/LogoDropdown";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { WifiOff, Loader2 } from "lucide-react";
import { SAPJsonCard } from "@/components/SAPJsonCard";
import { useNavigate } from 'react-router';
import { useEffect } from 'react';

export default function Landing() {
  const { isLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [docId, setDocId] = useState("");
  const [isLoadingSap, setIsLoadingSap] = useState(false);
  const [sapData, setSapData] = useState<any>(null);
  const [rawData, setRawData] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const loadSapData = async () => {
    if (!docId.trim()) {
      return;
    }

    setIsLoadingSap(true);
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        console.error("Supabase not configured");
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("id", docId)
        .single();

      setRawData(data);

      if (error) {
        console.error("Error fetching SAP data:", error);
        return;
      }

      // Try to extract SAP data from various fields
      const sapJson = data?.SAP_JSON_from_APP || data?.["SAP JSON"] || data?.sap_json;
      setSapData(sapJson);
    } catch (err) {
      console.error("Failed to load SAP data:", err);
    } finally {
      setIsLoadingSap(false);
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
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="container mx-auto px-4 py-12"
      >
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-card border rounded-lg p-6 shadow-sm">
            <h2 className="text-2xl font-semibold mb-4">SAP Data Viewer</h2>
            
            <div className="flex gap-3 mb-6">
              <input
                type="text"
                placeholder="Enter Document ID"
                value={docId}
                onChange={(e) => setDocId(e.target.value)}
                className="flex-1 px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Button 
                onClick={loadSapData} 
                disabled={isLoadingSap || !docId.trim()}
              >
                {isLoadingSap ? "Loading..." : "Load SAP Data"}
              </Button>
              {rawData && (
                <Button 
                  variant="outline"
                  onClick={() => setShowDebug(!showDebug)}
                >
                  {showDebug ? "Hide" : "Show"} Debug
                </Button>
              )}
            </div>

            {showDebug && rawData && (
              <div className="mb-6 p-4 bg-muted rounded-md">
                <h3 className="font-semibold mb-2">Raw Database Data:</h3>
                <pre className="text-xs overflow-auto max-h-96 bg-background p-3 rounded border">
                  {JSON.stringify(rawData, null, 2)}
                </pre>
              </div>
            )}

            {sapData && (
              <div className="mt-6">
                <SAPJsonCard 
                  data={sapData}
                  title="SAP Data"
                  defaultCollapsed={false}
                  hideHeader={false}
                />
              </div>
            )}

            {!sapData && !isLoadingSap && docId && (
              <div className="text-center text-muted-foreground py-8">
                No SAP data found for this document ID
              </div>
            )}
          </div>
        </div>
      </motion.section>
    </div>
  );
}