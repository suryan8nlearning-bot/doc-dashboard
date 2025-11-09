import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { motion } from 'framer-motion';
import { ArrowRight, FileText, Loader2, Search, Zap, User } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function Landing() {
  const { isLoading, isAuthenticated, user, signOut } = useAuth();
  const navigate = useNavigate();

  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(() => {
      const prefetch = async () => {
        try {
          await Promise.all([
            import("@/pages/Documents"),
            import("@/pages/Auth"),
            import("@/pages/DocumentDetail"),
          ]);
        } catch {}
      };
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => prefetch());
      } else {
        prefetch();
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate('/');
    } else {
      navigate('/auth');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex flex-col bg-gradient-to-b from-background to-background/60 relative overflow-hidden"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />

      <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-primary/20 blur-3xl dark:bg-primary/30" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-purple-500/20 blur-3xl dark:bg-purple-500/20" />

      <header className="sticky top-0 z-50 border-b bg-background/60 supports-[backdrop-filter]:bg-background/60 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Logo" className="h-8 w-8" loading="lazy" decoding="async" />
            <span className="text-xl font-bold tracking-tight">DocuVision</span>
          </div>
          <div className="flex items-center gap-3">
            {isAuthenticated && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full h-10 w-10 bg-primary/10 hover:bg-primary/20"
                    aria-label="User menu"
                  >
                    <User className="h-5 w-5 text-primary" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-xs text-muted-foreground">Signed in as</p>
                      <p className="text-sm font-medium leading-none">{user?.email || 'User'}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/')} className="cursor-pointer">
                    Home
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/dashboard')} className="cursor-pointer">
                    Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      await signOut();
                      navigate('/');
                    }}
                    className="cursor-pointer text-red-600"
                  >
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              variant="outline"
              onClick={handleGetStarted}
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

      <main className="flex-1 flex flex-col items-center justify-center px-8 py-24">
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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="max-w-4xl mx-auto text-center space-y-8 relative"
        >
          <img
            src="/logo_bg.svg"
            alt=""
            aria-hidden
            className="pointer-events-none select-none absolute inset-0 m-auto opacity-10 -z-10 max-w-[720px]"
            loading="lazy"
            decoding="async"
          />
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 ring-1 ring-white/10 supports-[backdrop-filter]:bg-white/5 backdrop-blur text-sm font-medium">
            <Zap className="h-4 w-4" />
            Intelligent Document Processing
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight">
            Extract insights from
            <br />
            <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              documents instantly
            </span>
          </h1>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Visualize document data with interactive PDF previews. Hover over fields to highlight
            and zoom into specific sections with precision.
          </p>

          <div className="flex items-center justify-center gap-4 pt-4">
            <Button
              size="lg"
              onClick={handleGetStarted}
              disabled={isLoading}
              className="text-base px-8 rounded-full ring-1 ring-white/10 bg-gradient-to-r from-primary to-purple-600 text-white hover:from-primary/90 hover:to-purple-600/90 shadow-lg shadow-primary/20"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : (
                <>
                  Get Started
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="max-w-5xl mx-auto mt-32 grid md:grid-cols-3 gap-8"
        >
          <motion.div
            whileHover={{ y: -8, boxShadow: '0 20px 40px rgba(0,0,0,0.08)' }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="group text-center space-y-4 p-8 rounded-xl border border-white/10 ring-1 ring-white/10 bg-white/5 supports-[backdrop-filter]:bg-white/5 backdrop-blur hover:bg-white/10 shadow-lg hover:shadow-2xl transition-all cursor-pointer"
          >
            <motion.div
              whileHover={{ scale: 1.1, rotate: 5 }}
              className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-white/10 ring-1 ring-white/10 shadow-md text-primary transition-transform group-hover:scale-110"
            >
              <FileText className="h-6 w-6 text-primary" />
            </motion.div>
            <h3 className="text-lg font-semibold">Interactive Preview</h3>
            <p className="text-muted-foreground leading-relaxed">
              View PDFs with real-time highlighting and zoom capabilities for precise document
              inspection.
            </p>
          </motion.div>

          <motion.div
            whileHover={{ y: -8, boxShadow: '0 20px 40px rgba(0,0,0,0.08)' }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-center space-y-4 p-8 rounded-lg border bg-card/60 hover:bg-card shadow-sm hover:shadow-xl transition-all cursor-pointer"
          >
            <motion.div
              whileHover={{ scale: 1.1, rotate: -5 }}
              className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10"
            >
              <Search className="h-6 w-6 text-primary" />
            </motion.div>
            <h3 className="text-lg font-semibold">Smart Extraction</h3>
            <p className="text-muted-foreground leading-relaxed">
              Automatically extract structured data from documents with bounding box coordinates.
            </p>
          </motion.div>

          <motion.div
            whileHover={{ y: -8, boxShadow: '0 20px 40px rgba(0,0,0,0.08)' }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-center space-y-4 p-8 rounded-lg border bg-card/60 hover:bg-card shadow-sm hover:shadow-xl transition-all cursor-pointer"
          >
            <motion.div
              whileHover={{ scale: 1.1, rotate: 5 }}
              className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10"
            >
              <Zap className="h-6 w-6 text-primary" />
            </motion.div>
            <h3 className="text-lg font-semibold">Instant Access</h3>
            <p className="text-muted-foreground leading-relaxed">
              Connect to your Supabase database and access documents instantly with zero
              configuration.
            </p>
          </motion.div>
        </motion.div>
      </main>

      <footer className="border-t py-8">
        <div className="max-w-7xl mx-auto px-8 text-center text-sm text-muted-foreground">
          Powered by{' '}
          <a
            href="https://vly.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-primary transition-colors"
          >
            vly.ai
          </a>
        </div>
      </footer>
    </motion.div>
  );
}