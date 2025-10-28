import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { supabase, hasSupabaseEnv, publicUrlForPath } from '@/lib/supabase';
import { motion } from 'framer-motion';
import { FileText, Loader2, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function Dashboard() {
  const { isLoading: authLoading, isAuthenticated, user, signOut } = useAuth();
  const navigate = useNavigate();

  type DashboardDoc = {
    id: string;
    created_at: string;
    pdf_url: string;
    status?: string;
    title?: string;
    document_data?: any;
    raw?: any;
  };

  const [documents, setDocuments] = useState<DashboardDoc[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/auth');
    }
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (isAuthenticated) {
      if (hasSupabaseEnv) {
        fetchDocuments();
      } else {
        setIsLoadingDocs(false);
        toast.error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in API keys tab.');
      }
    }
  }, [isAuthenticated]);

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
      const { data, error } = await supabase
        .from('N8N Logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      const mapped: DashboardDoc[] = (data as any[] | null || []).map((row: any, idx: number) => {
        const path = row?.['Bucket Name'] ?? row?.bucket_name ?? row?.path ?? '';
        const pdf_url = path ? publicUrlForPath(path) : '';
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
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Documents</h2>
            {uniqueStatuses.length > 0 && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
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
            )}
          </div>

          {!hasSupabaseEnv ? (
            <div className="text-center py-12 space-y-4">
              <FileText className="h-16 w-16 mx-auto text-muted-foreground opacity-20" />
              <div className="text-lg font-medium">Supabase is not configured</div>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Add SUPABASE_URL and SUPABASE_ANON_KEY in the Integrations tab, then refresh.
              </p>
            </div>
          ) : isLoadingDocs ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <FileText className="h-16 w-16 mx-auto text-muted-foreground opacity-20" />
              <div className="text-lg font-medium">No documents found</div>
              <p className="text-sm text-muted-foreground">
                {statusFilter !== 'ALL' ? 'Try changing the status filter' : 'Documents will appear here once added'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDocs.map((doc) => (
                <motion.div
                  key={doc.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate(`/document/${doc.id}`)}
                  className="cursor-pointer p-6 rounded-lg border bg-card hover:bg-accent transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate mb-1">
                        {doc.title || 'Untitled Document'}
                      </h3>
                      {doc.status && (
                        <div className="inline-block px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary mb-2">
                          {doc.status}
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : ''}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}