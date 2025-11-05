import { Toaster } from "@/components/ui/sonner";
import { InstrumentationProvider } from "@/instrumentation.tsx";
import { StrictMode, useEffect, useState, lazy, Suspense, createContext, useContext, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";
import "./types/global.d.ts";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

const AuthPage = lazy(() => import("@/pages/Auth.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const DocumentDetail = lazy(() => import("./pages/DocumentDetail.tsx"));
const Profile = lazy(() => import("@/pages/Profile.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const Documents = lazy(() => import("./pages/Documents.tsx"));

const PendingContext = createContext<{ pending: boolean; setPending: (p: boolean) => void } | null>(null);

function PendingProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(false);
  return <PendingContext.Provider value={{ pending, setPending }}>{children}</PendingContext.Provider>;
}

function IdleSessionProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, signOut } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;

    const getTimeoutMs = () => {
      try {
        const v = Number(localStorage.getItem("sessionTimeoutMin") || "");
        const minutes = Number.isFinite(v) && v >= 1 ? v : 15;
        return minutes * 60_000;
      } catch {
        return 15 * 60_000;
      }
    };

    let timer: number | null = null;
    const TIMEOUT_MS = getTimeoutMs();

    const startTimer = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        try {
          toast("Session timed out. Please sign in again.");
        } catch {}
        try {
          await signOut();
        } catch {}
      }, TIMEOUT_MS);
    };

    const broadcastActivity = () => {
      try {
        localStorage.setItem("idle:lastActivity", String(Date.now()));
      } catch {}
    };

    const reset = () => {
      startTimer();
      broadcastActivity();
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === "idle:lastActivity") {
        startTimer();
      }
    };

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    window.addEventListener("storage", onStorage);

    reset();

    return () => {
      if (timer) window.clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, reset as any));
      window.removeEventListener("storage", onStorage);
    };
  }, [isAuthenticated, signOut]);

  return <>{children}</>;
}

function Protected({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  if (isLoading) return <RouteFallback />;

  return isAuthenticated ? <>{children}</> : <AuthPage redirectAfterAuth="/dashboard" />;
}

function RouteFallback() {
  const ctx = useContext(PendingContext);
  useEffect(() => {
    ctx?.setPending(true);
    return () => ctx?.setPending(false);
  }, [ctx]);

  return (
    <div
      className="min-h-screen grid place-items-center bg-background text-muted-foreground"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      Loading…
    </div>
  );
}

function RouteSyncer() {
  const location = useLocation();

  return null;
}

function RouteProgressBar() {
  const pendingCtx = useContext(PendingContext);
  const pending = pendingCtx?.pending ?? false;
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let incTimer: number | null = null;
    let hideTimer: number | null = null;

    if (pending) {
      setVisible(true);
      setProgress(10);
      incTimer = window.setInterval(() => {
        setProgress((p) => {
          const next = p + Math.random() * 10;
          return next >= 90 ? 90 : next;
        });
      }, 200);
    } else {
      if (visible) {
        setProgress(100);
        hideTimer = window.setTimeout(() => {
          setVisible(false);
          setProgress(0);
        }, 250);
      }
    }

    return () => {
      if (incTimer) window.clearInterval(incTimer);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, [pending, visible]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-0.5">
      <div
        className="h-full bg-gradient-to-r from-primary to-purple-600 transition-[width] duration-300"
        style={{ width: `${progress}%` }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        aria-label="Page loading progress"
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <InstrumentationProvider>
        <IdleSessionProvider>
          <PendingProvider>
            <BrowserRouter>
              <RouteProgressBar />
              <RouteSyncer />
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<Protected><Dashboard /></Protected>} />
                  <Route path="/auth" element={<AuthPage redirectAfterAuth="/dashboard" />} />
                  <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
                  <Route path="/document/:documentId" element={<Protected><DocumentDetail /></Protected>} />
                  <Route path="/documents" element={<Protected><Documents /></Protected>} />
                  <Route path="/profile" element={<Protected><Profile /></Protected>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
            <Toaster />
          </PendingProvider>
        </IdleSessionProvider>
      </InstrumentationProvider>
    </ConvexAuthProvider>
  </StrictMode>,
);