import { DocumentFields } from '@/components/DocumentFields';
import { PDFViewer } from '@/components/PDFViewer';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { supabase, type BoundingBox, hasSupabaseEnv, publicUrlForPath } from '@/lib/supabase';
import { createSignedUrlForPath } from '@/lib/supabase';
import { motion } from 'framer-motion';
import { ArrowLeft, FileText, Loader2, ExternalLink, ArrowUp } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

export default function DocumentDetail() {
  const { isLoading: authLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const { documentId } = useParams<{ documentId: string }>();

  type DocumentData = {
    id: string;
    created_at: string;
    pdf_url: string;
    status?: string;
    title?: string;
    document_data?: any;
  };

  // Rename to avoid shadowing the global window.document
  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [highlightBox, setHighlightBox] = useState<BoundingBox | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Add aside ref for scroll-to-top control
  const asideRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/auth');
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Apply theme from user profile on this page
  useEffect(() => {
    if (!user?.theme) return;
    const root = document.documentElement;
    root.classList.remove('dark', 'glass-theme');
    if (user.theme === 'glass') {
      root.classList.add('glass-theme');
    } else if (user.theme === 'dark') {
      root.classList.add('dark');
    }
  }, [user?.theme]);

  useEffect(() => {
    if (isAuthenticated && documentId) {
      if (hasSupabaseEnv) {
        fetchDocument();
      } else {
        setIsLoading(false);
        toast.error('Supabase is not configured.');
      }
    }
  }, [isAuthenticated, documentId]);

  const coerceDocumentData = (row: any) => {
    const candidates = [
      row?.PDF_AI_OUTPUT,
      row?.['PDF_AI_OUTPUT'],
      row?.pdf_ai_output,
      row?.document_data,
      row?.data,
      row?.json,
      row?.payload,
      row?.['Document Data'],
      row?.['document_data'],
      row?.['Data'],
    ];
    for (const cand of candidates) {
      try {
        const obj = typeof cand === 'string' ? JSON.parse(cand) : cand;
        if (obj?.document?.pages && Array.isArray(obj.document.pages) && obj.document.pages.length > 0) {
          return obj;
        }
      } catch {
        // ignore parse errors
      }
    }
    return undefined;
  };

  const fetchDocument = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('N8N Logs')
        .select('*')
        .eq('id', documentId)
        .single();

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      if (!data) {
        toast.error('Document not found');
        navigate('/dashboard');
        return;
      }

      // Build robust storage path from possible fields
      const bucket = data?.['Bucket Name'] ?? data?.bucket_name ?? data?.bucket ?? '';
      const objectPathCandidates = [
        data?.path,
        data?.['Path'],
        data?.object_path,
        data?.['Object Path'],
        data?.file,
        data?.filename,
        data?.name,
      ];
      const objectPath = objectPathCandidates.find((v: any) => typeof v === 'string' && v.trim().length > 0) as string | undefined;

      let path = '';
      if (bucket && objectPath) {
        path = `${bucket}/${objectPath}`;
      } else if (typeof data?.path === 'string') {
        path = String(data.path);
      } else if (typeof data?.['Bucket Name'] === 'string' && String(data['Bucket Name']).includes('/')) {
        // Some rows may store full path in "Bucket Name"
        path = String(data['Bucket Name']);
      }

      // Prefer a signed URL to avoid Chrome blocking and private bucket issues
      const signedUrl = path ? await createSignedUrlForPath(path, 60 * 10) : '';
      const pdf_url = signedUrl || (path ? publicUrlForPath(path) : '');

      console.log('Document data:', {
        id: data.id,
        path,
        signed: Boolean(signedUrl),
        pdf_url,
        bucket_name: data?.['Bucket Name'],
        all_keys: Object.keys(data),
        raw_data: data,
      });

      if (!pdf_url) {
        console.error('No PDF URL could be constructed. Available data:', data);
        toast.error('PDF URL is missing from document data');
      }

      const status = data?.status ?? data?.Status ?? data?.state ?? data?.State;
      const created_at = data?.created_at ?? data?.createdAt ?? data?.timestamp ?? new Date().toISOString();
      const document_data = coerceDocumentData(data);
      const title =
        document_data?.document?.pages?.[0]?.metadata?.document_title?.value ||
        (typeof data?.title === 'string' ? data.title : undefined) ||
        (typeof path === 'string' ? String(path).split('/').pop() : undefined) ||
        'Untitled Document';

      setDoc({
        id: String(data.id),
        created_at: String(created_at),
        pdf_url,
        status: status ? String(status) : undefined,
        document_data,
        title,
      });
    } catch (error) {
      console.error('Error fetching document:', error);
      toast.error(`Failed to load document: ${error instanceof Error ? error.message : 'Unknown error'}`);
      navigate('/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !doc) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between px-8 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/dashboard')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Documents
            </Button>
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <h1 className="text-lg font-semibold">{doc.title}</h1>
                {doc.status && (
                  <span className="text-xs text-muted-foreground">{doc.status}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a 
              href={doc.pdf_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Open PDF in new tab
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* PDF Viewer */}
        <div className="relative h-full min-w-0 flex-1 overflow-hidden">
          <PDFViewer pdfUrl={doc.pdf_url} highlightBox={highlightBox} documentData={doc.document_data} />
        </div>

        {/* Document Fields */}
        <aside ref={asideRef} className="relative w-[420px] lg:w-[560px] border-l bg-background overflow-hidden flex-shrink-0">
          {doc.document_data &&
          doc.document_data?.document?.pages?.length > 0 ? (
            <DocumentFields
              documentData={doc.document_data}
              onFieldHover={setHighlightBox}
            />
          ) : (
            <div className="h-full p-6 text-sm text-muted-foreground">
              No structured data available for this document.
            </div>
          )}
          {/* Scroll to top button for fields panel */}
          <Button
            variant="outline"
            size="icon"
            className="absolute bottom-4 right-4 z-20 rounded-full h-8 w-8"
            onClick={() => {
              const viewport = asideRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
              if (viewport) {
                viewport.scrollTo({ top: 0, behavior: 'smooth' });
              } else {
                // Fallback: scroll the aside if viewport not detected
                asideRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            aria-label="Scroll to top"
            title="Scroll to top"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </aside>
      </div>
    </div>
  );
}