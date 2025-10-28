import { DocumentFields } from '@/components/DocumentFields';
import { PDFViewer } from '@/components/PDFViewer';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { supabase, type BoundingBox, hasSupabaseEnv, publicUrlForPath } from '@/lib/supabase';
import { motion } from 'framer-motion';
import { ArrowLeft, FileText, Loader2, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

export default function DocumentDetail() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
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

  const [document, setDocument] = useState<DocumentData | null>(null);
  const [highlightBox, setHighlightBox] = useState<BoundingBox | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/auth');
    }
  }, [authLoading, isAuthenticated, navigate]);

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

      const path = data?.['Bucket Name'] ?? data?.bucket_name ?? data?.path ?? '';
      const pdf_url = path ? publicUrlForPath(path) : '';
      
      console.log('Document data:', {
        id: data.id,
        path,
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

      setDocument({
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

  if (!isAuthenticated || !document) {
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
                <h1 className="text-lg font-semibold">{document.title}</h1>
                {document.status && (
                  <span className="text-xs text-muted-foreground">{document.status}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a 
              href={document.pdf_url} 
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
        <div className="flex-1 overflow-hidden">
          <PDFViewer pdfUrl={document.pdf_url} highlightBox={highlightBox} />
        </div>

        {/* Document Fields */}
        <aside className="w-96 border-l bg-background overflow-hidden">
          {document.document_data &&
          document.document_data?.document?.pages?.length > 0 ? (
            <DocumentFields
              documentData={document.document_data}
              onFieldHover={setHighlightBox}
            />
          ) : (
            <div className="h-full p-6 text-sm text-muted-foreground">
              No structured data available for this document.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}