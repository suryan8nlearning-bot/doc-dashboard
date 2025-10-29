import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { motion } from 'framer-motion';
import { ArrowRight, FileText, Loader2, Search, Zap } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { useLocation } from 'react-router';
import { supabase, hasSupabaseEnv } from '@/lib/supabase';
import { toast } from 'sonner';

export default function Landing() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [docId, setDocId] = useState<string>('');
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [showSap, setShowSap] = useState<boolean>(true);
  const [rawJson, setRawJson] = useState<string>('');
  const [sapJson, setSapJson] = useState<string>('');
  const [editorValue, setEditorValue] = useState<string>('');
  const [isRowLoading, setIsRowLoading] = useState<boolean>(false);

  // Add online/offline detection for error banner
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

  // Add: read ?id= from URL
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const idParam = params.get('id');
      if (idParam) setDocId(idParam);
    } catch {}
  }, [location.search]);

  // Add: fetch row from Supabase when id present
  useEffect(() => {
    const load = async () => {
      if (!docId || !hasSupabaseEnv) return;
      setIsRowLoading(true);
      try {
        const { data, error } = await supabase
          .from('N8N Logs')
          .select('pdf_ai_output, SAP_AI_OUTPUT, document_data')
          .eq('id', docId)
          .single();
        if (error) throw error;

        let current = '';
        const candidates = [data?.pdf_ai_output, data?.document_data];
        for (const c of candidates) {
          if (!c) continue;
          try {
            current = typeof c === 'string' ? c : JSON.stringify(c, null, 2);
            break;
          } catch {}
        }
        const sap =
          data?.SAP_AI_OUTPUT
            ? (typeof data.SAP_AI_OUTPUT === 'string'
                ? data.SAP_AI_OUTPUT
                : JSON.stringify(data.SAP_AI_OUTPUT, null, 2))
            : '{\n  "output": {\n    "to_Item": []\n  }\n}';

        setRawJson(current);
        setSapJson(sap);
        setEditorValue(showSap ? sap : current);
      } catch (e: any) {
        console.error('Failed to load row', e);
        toast.error(`Failed to load row: ${e?.message || e}`);
      } finally {
        setIsRowLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, hasSupabaseEnv]);

  // Add: sync editor when toggling view
  useEffect(() => {
    setEditorValue(showSap ? sapJson : rawJson);
  }, [showSap, sapJson, rawJson]);

  // Show a full-screen animated loader while auth initializes
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        {/* Header skeleton */}
        <header className="border-b">
          <div className="max-w-7xl mx-auto px-8 py-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-6 w-28" />
            </div>
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </header>

        {/* Hero skeleton */}
        <main className="flex-1 flex flex-col items-center justify-center px-8 py-24">
          <div className="max-w-4xl mx-auto w-full text-center space-y-8">
            <div className="flex justify-center">
              <Skeleton className="h-8 w-64 rounded-full" />
            </div>

            <div className="space-y-3">
              <Skeleton className="h-12 w-3/4 mx-auto" />
              <Skeleton className="h-12 w-1/2 mx-auto" />
            </div>

            <div className="space-y-2 max-w-2xl mx-auto">
              <Skeleton className="h-4 w-full mx-auto" />
              <Skeleton className="h-4 w-11/12 mx-auto" />
              <Skeleton className="h-4 w-10/12 mx-auto" />
            </div>

            <div className="flex justify-center pt-2">
              <Skeleton className="h-10 w-36 rounded-md" />
            </div>
          </div>

          {/* Features skeleton */}
          <div className="max-w-5xl mx-auto mt-24 grid md:grid-cols-3 gap-8 w-full">
            <div className="p-8 rounded-lg border bg-card/50">
              <Skeleton className="h-12 w-12 rounded-lg mb-4" />
              <Skeleton className="h-5 w-40 mb-2" />
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-5/6" />
            </div>
            <div className="p-8 rounded-lg border bg-card/50">
              <Skeleton className="h-12 w-12 rounded-lg mb-4" />
              <Skeleton className="h-5 w-40 mb-2" />
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-5/6" />
            </div>
            <div className="p-8 rounded-lg border bg-card/50">
              <Skeleton className="h-12 w-12 rounded-lg mb-4" />
              <Skeleton className="h-5 w-40 mb-2" />
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>
        </main>

        {/* Footer skeleton */}
        <footer className="border-t py-8">
          <div className="max-w-7xl mx-auto px-8 text-center">
            <Skeleton className="h-4 w-40 mx-auto" />
          </div>
        </footer>
      </div>
    );
  }

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate('/dashboard');
    } else {
      navigate('/auth');
    }
  };

  // Add: handlers for SAP panel
  const handleFormat = () => {
    try {
      const parsed = JSON.parse(editorValue || '{}');
      const pretty = JSON.stringify(parsed, null, 2);
      setEditorValue(pretty);
      if (showSap) setSapJson(pretty);
      else setRawJson(pretty);
      toast.success('JSON formatted');
    } catch {
      toast.error('Invalid JSON; cannot format');
    }
  };

  const handleCreate = async () => {
    if (!webhookUrl) {
      toast.error('Enter a webhook URL');
      return;
    }
    if (!docId) {
      toast.error('Enter a document id');
      return;
    }
    // Always send SAP payload (edited)
    let payload: any = null;
    try {
      payload = JSON.parse(sapJson || '{}');
    } catch {
      toast.error('SAP payload is not valid JSON');
      return;
    }
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: docId, payload }),
      });
      if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
      toast.success('Webhook called successfully');
    } catch (e: any) {
      toast.error(`Webhook failed: ${e?.message || e}`);
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
        {/* Offline error banner */}
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

        {/* SAP Webhook Panel */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="max-w-5xl mx-auto mt-12 w-full"
        >
          <Card className="bg-card/60">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>SAP Webhook</span>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {hasSupabaseEnv ? (
                    isRowLoading ? (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading row…
                      </span>
                    ) : (
                      <span>Supabase connected</span>
                    )
                  ) : (
                    <span>Supabase not configured</span>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="docId">Document ID</Label>
                  <Input
                    id="docId"
                    placeholder="Enter document id (or use ?id= in URL)"
                    value={docId}
                    onChange={(e) => setDocId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="webhookUrl">Webhook URL</Label>
                  <Input
                    id="webhookUrl"
                    placeholder="https://example.com/webhook"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-2">
                <div className="flex items-center gap-2">
                  <Switch
                    id="toggleSap"
                    checked={showSap}
                    onCheckedChange={(v) => setShowSap(Boolean(v))}
                  />
                  <Label htmlFor="toggleSap" className="cursor-pointer">
                    Show SAP Payload
                  </Label>
                </div>
                <div className="text-xs text-muted-foreground">
                  {showSap ? 'Editing SAP_AI_OUTPUT' : 'Viewing current JSON'}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="editor">{showSap ? 'SAP Payload (editable)' : 'Current JSON (read-only if from DB)'}</Label>
                <Textarea
                  id="editor"
                  className="min-h-[220px] font-mono text-xs"
                  value={editorValue}
                  onChange={(e) => {
                    setEditorValue(e.target.value);
                    if (showSap) setSapJson(e.target.value);
                    else setRawJson(e.target.value);
                  }}
                  placeholder={showSap ? '{ "output": { ... } }' : '{ ... }'}
                />
              </div>
            </CardContent>
            <CardFooter className="flex items-center justify-between">
              <Button variant="outline" onClick={handleFormat}>
                Format JSON
              </Button>
              <Button onClick={handleCreate}>
                Create
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
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