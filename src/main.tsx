import { Toaster } from "@/components/ui/sonner";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { InstrumentationProvider } from "@/instrumentation.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { StrictMode, useEffect, useState, lazy, Suspense, createContext, useContext, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";
import "./types/global.d.ts";

const isVlyHost = (() => {
  try {
    if (typeof window === "undefined" || typeof document === "undefined") return false;
    const ref = document.referrer || "";
    const host = window.location.hostname || "";
    const inIframe = window.top !== window.self;
    return inIframe && (ref.includes("vly.ai") || ref.includes("vly.sh") || host.endsWith("vly.sh"));
  } catch {
    return false;
  }
})();

const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("@/pages/Auth.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const DocumentDetail = lazy(() => import("./pages/DocumentDetail.tsx"));
const Profile = lazy(() => import("@/pages/Profile.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// Add pending context for coordinating route loading UI
const PendingContext = createContext<{ pending: boolean; setPending: (p: boolean) => void } | null>(null);

function PendingProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(false);
  return <PendingContext.Provider value={{ pending, setPending }}>{children}</PendingContext.Provider>;
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
  useEffect(() => {
    if (!isVlyHost) return; // Only talk to parent when inside vly iframe
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    if (!isVlyHost) return; // Only listen for parent navigation when inside vly iframe
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

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
    {isVlyHost ? <VlyToolbar /> : null}
    <InstrumentationProvider>
      <ConvexAuthProvider client={convex}>
        <PendingProvider>
          <BrowserRouter>
            <RouteProgressBar />
            <RouteSyncer />
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/auth" element={<AuthPage redirectAfterAuth="/dashboard" />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/document/:documentId" element={<DocumentDetail />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          <Toaster />
        </PendingProvider>
      </ConvexAuthProvider>
    </InstrumentationProvider>
  </StrictMode>,
);