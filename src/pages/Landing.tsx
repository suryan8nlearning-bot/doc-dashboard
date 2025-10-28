import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { motion } from 'framer-motion';
import { ArrowRight, FileText, Loader2, Search, Zap } from 'lucide-react';
import { useNavigate } from 'react-router';

export default function Landing() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate('/dashboard');
    } else {
      navigate('/auth');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex flex-col bg-background"
    >
      {/* Header */}
      <header className="border-b">
        <div className="max-w-7xl mx-auto px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Logo" className="h-8 w-8" />
            <span className="text-xl font-bold tracking-tight">DocuVision</span>
          </div>
          <Button
            variant="outline"
            onClick={handleGetStarted}
            disabled={isLoading}
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
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="max-w-4xl mx-auto text-center space-y-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted text-sm font-medium">
            <Zap className="h-4 w-4" />
            Intelligent Document Processing
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight">
            Extract insights from
            <br />
            <span className="text-primary">documents instantly</span>
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
              className="text-base px-8"
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

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="max-w-5xl mx-auto mt-32 grid md:grid-cols-3 gap-8"
        >
          <motion.div
            whileHover={{ y: -8, boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-center space-y-4 p-8 rounded-lg border bg-card/50 hover:bg-card transition-colors cursor-pointer"
          >
            <motion.div
              whileHover={{ scale: 1.1, rotate: 5 }}
              className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10"
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
            whileHover={{ y: -8, boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-center space-y-4 p-8 rounded-lg border bg-card/50 hover:bg-card transition-colors cursor-pointer"
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
            whileHover={{ y: -8, boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-center space-y-4 p-8 rounded-lg border bg-card/50 hover:bg-card transition-colors cursor-pointer"
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

      {/* Footer */}
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