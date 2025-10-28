import { DocumentFields } from '@/components/DocumentFields';
import { PDFViewer } from '@/components/PDFViewer';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { supabase, type BoundingBox, hasSupabaseEnv, publicUrlForPath } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { motion } from 'framer-motion';
import { FileText, Loader2, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function Dashboard() {
  const { isLoading: authLoading, isAuthenticated, user, signOut } = useAuth();
  const navigate = useNavigate();

  // Define a local doc shape tailored to N8N Logs rows
  type DashboardDoc = {
    id: string;
    created_at: string;
    pdf_url: string;
    status?: string;
    title?: string;
    document_data?: any; // keep flexible; validated before rendering fields
    raw?: any;
  };

  const [documents, setDocuments] = useState<DashboardDoc[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<DashboardDoc | null>(null);
  const [highlightBox, setHighlightBox] = useState<BoundingBox | null>(null);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/auth');
    }
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (isAuthenticated) {
      console.log('hasSupabaseEnv:', hasSupabaseEnv);
      if (hasSupabaseEnv) {
        fetchDocuments();
      } else {
        setIsLoadingDocs(false);
        toast.error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in API keys tab.');
      }
    }
  }, [isAuthenticated]);

  // Helper to coerce potential JSON columns into expected document_data shape
  const coerceDocumentData = (row: any) => {
    const candidates = [
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

  const fetchDocuments = async () => {
    try {
      setIsLoadingDocs(true);
      console.log('Fetching documents from N8N Logs table...');
      const { data, error } = await supabase
        .from('N8N Logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }
      console.log('Documents fetched:', data);

      const mapped: DashboardDoc[] = (data as any[] | null || []).map((row: any, idx: number) => {
        const path = row?.['Bucket Name'] ?? row?.bucket_name ?? row?.path ?? '';
        const pdf_url = path ? publicUrlForPath(String(path)) : '';
        const status = row?.status ?? row?.Status ?? row?.state ?? row?.State;
        const created_at = row?.created_at ?? row?.createdAt ?? row?.timestamp ?? new Date().toISOString();
        const id = String(row?.id ?? row?.uuid ?? row?._id ?? `${created_at}-${idx}`);
        const document_data = coerceDocumentData(row);
        const title =
          document_data?.document?.pages?.[0]?.metadata?.document_title?.value ||
          (typeof row?.title === 'string' ? row.title : undefined) ||
          (typeof path === 'string' ? String(path).split('/').pop() : undefined) ||
          'Untitled Document';
        return {
          id,
          created_at: String(created_at),
          pdf_url,
          status: status ? String(status) : undefined,
          document_data,
          raw: row,
          title,
        };
      });

      setDocuments(mapped);
      if (mapped.length > 0) {
        setSelectedDocument(mapped[0]);
      } else {
        setSelectedDocument(null);
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast.error(`Failed to load documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Compute unique statuses for filter
  const uniqueStatuses = Array.from(
    new Set(documents.map((d) => (d.status ?? '').trim()).filter((s) => s.length > 0))
  );
  const filteredDocs =
    statusFilter === 'ALL'
      ? documents
      : documents.filter((d) => (d.status ?? '').toLowerCase() === statusFilter.toLowerCase());

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between px-8 py-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo.svg"
              alt="Logo"
              className="h-8 w-8 cursor-pointer"
              onClick={() => navigate('/')}
            />
            <h1 className="text-xl font-bold tracking-tight">Document Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/profile')}
              className="cursor-pointer"
            >
              {user?.email || 'User'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Document List */}
        <aside className="w-64 border-r bg-muted/30 overflow-y-auto">
          <div className="p-6">
            <h2 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wide">
              Documents
            </h2>

            {/* Status Filter */}
            <div className="mb-4">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Filter by Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  {uniqueStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!hasSupabaseEnv ? (
              <div className="text-sm text-muted-foreground space-y-2">
                <p>Supabase is not configured.</p>
                <p className="text-xs">
                  Add SUPABASE_URL and SUPABASE_ANON_KEY in the Integrations tab, then refresh.
                </p>
              </div>
            ) : isLoadingDocs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No documents found
              </div>
            ) : (
              <div className="space-y-2">
                {filteredDocs.map((doc) => (
                  <motion.button
                    key={doc.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedDocument(doc)}
                    className={`w-full text-left p-4 rounded-lg border transition-colors ${
                      selectedDocument?.id === doc.id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted border-border'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <FileText className="h-5 w-5 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {doc.title || 'Untitled Document'}
                        </div>
                        <div className="text-xs opacity-70 mt-1">
                          {doc.status ? `${doc.status} • ` : ''}
                          {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : ''}
                        </div>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        {selectedDocument ? (
          <div className="flex-1 flex overflow-hidden">
            {/* PDF Viewer */}
            <div className="flex-1 overflow-hidden">
              <PDFViewer pdfUrl={selectedDocument.pdf_url} highlightBox={highlightBox} />
            </div>

            {/* Document Fields */}
            <aside className="w-96 border-l bg-background overflow-hidden">
              {selectedDocument.document_data &&
              selectedDocument.document_data?.document?.pages?.length > 0 ? (
                <DocumentFields
                  documentData={selectedDocument.document_data}
                  onFieldHover={setHighlightBox}
                />
              ) : (
                <div className="h-full p-6 text-sm text-muted-foreground">
                  No structured data available for this document.
                </div>
              )}
            </aside>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FileText className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p>Select a document to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}