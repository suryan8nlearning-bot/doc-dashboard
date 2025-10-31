import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { supabase, hasSupabaseEnv, publicUrlForPath } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { BulkActionsBar } from '@/components/dashboard/BulkActionsBar';
import { DocumentsTable } from '@/components/dashboard/DocumentsTable';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function Documents() {
  const { isLoading: authLoading, isAuthenticated, user, signOut } = useAuth();
  const navigate = useNavigate();

  type DashboardDoc = {
    id: string;
    created_at: string;
    pdf_url: string;
    status?: string;
    title?: string;
    document_data?: any;
    from_email?: string;
    cc_emails?: string[];
    subject?: string;
    bucket_name?: string;
    mail_content?: string;
    raw?: any;
  };

  const [documents, setDocuments] = useState<DashboardDoc[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [selectedMailContent, setSelectedMailContent] = useState<string | null>(null);
  const [isMailDialogOpen, setIsMailDialogOpen] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate('/auth');
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (user?.theme) {
      const root = document.documentElement;
      root.classList.remove('dark', 'glass-theme');
      if (user.theme === 'glass') root.classList.add('glass-theme');
      else if (user.theme === 'dark') {
        root.classList.add('dark');
        setIsDarkMode(true);
      }
    }
  }, [user?.theme]);

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

  const parseEmailField = (field: any): string => {
    if (!field) return '';
    if (typeof field === 'string') return field;
    if (Array.isArray(field) && field.length > 0) {
      const first = field[0];
      if (typeof first === 'string') return first;
      if (first?.value) return first.value;
      if (first?.address) return first.address;
      if (first?.email) return first.email;
    }
    if (field.value) return field.value;
    if (field.address) return field.address;
    if (field.email) return field.email;
    return '';
  };

  const parseCCEmails = (field: any): string[] => {
    const extractEmail = (item: any): string => {
      if (!item) return "";
      if (typeof item === "string") return item;
      if (typeof item === "object") {
        return item.value || item.address || item.email || "";
      }
      return "";
    };
    if (Array.isArray(field)) {
      return field.map(extractEmail).filter(Boolean);
    }
    if (typeof field === "string") {
      const trimmed = field.trim();
      if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed.map(extractEmail).filter(Boolean);
          if (parsed && typeof parsed === "object") {
            const arrCandidates =
              parsed.cc ||
              parsed.CC ||
              parsed.cc_emails ||
              parsed.recipients ||
              parsed.Recipients ||
              parsed.addresses ||
              parsed.to ||
              parsed.To ||
              parsed.list;
            if (Array.isArray(arrCandidates)) return arrCandidates.map(extractEmail).filter(Boolean);
            const single = parsed.value || parsed.address || parsed.email;
            if (single) return [String(single)].filter(Boolean);
          }
        } catch {
          // fall through
        }
      }
      return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (field && typeof field === "object") {
      const arrCandidates =
        field.cc ||
        field.CC ||
        field.cc_emails ||
        field.recipients ||
        field.Recipients ||
        field.addresses ||
        field.to ||
        field.To ||
        field.list;
      if (Array.isArray(arrCandidates)) return arrCandidates.map(extractEmail).filter(Boolean);
      const single = field.value || field.address || field.email;
      if (single) return [String(single)].filter(Boolean);
    }
    return [];
  };

  const getMailContent = (row: any): string => {
    const keys: Array<string> = [
      "mail_content", "Mail Content", "mail content", "mailContent",
      "html", "HTML", "body", "Body", "content", "Content", "message", "Message",
      "text", "Text", "email_body", "Email Body", "emailBody",
    ];
    const readFromObject = (obj: any): string | undefined => {
      if (!obj || typeof obj !== "object") return undefined;
      for (const k of ["html", "HTML", "body", "Body", "text", "Text", "content", "Content", "message", "Message"]) {
        const v = obj[k];
        if (typeof v === "string" && v.trim().length) return v;
      }
      if (obj.data && typeof obj.data === "object") {
        for (const k of ["html", "HTML", "body", "Body", "text", "Text", "content", "Content", "message", "Message"]) {
          const v = obj.data[k];
          if (typeof v === "string" && v.trim().length) return v;
        }
      }
      return undefined;
    };
    for (const k of keys) {
      const candidate = row?.[k];
      if (candidate == null) continue;
      if (typeof candidate === "string") {
        const s = candidate.trim();
        if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
          try {
            const parsed = JSON.parse(s);
            const fromParsed = readFromObject(parsed);
            if (fromParsed) return fromParsed;
          } catch {}
        }
        if (s.length) return s;
      }
      if (typeof candidate === "object") {
        const fromObj = readFromObject(candidate);
        if (fromObj) return fromObj;
      }
    }
    return "";
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

        const from_email = parseEmailField(row?.from ?? row?.From ?? row?.from_email ?? row?.sender ?? row?.['From Email']);

        const cc_emails = parseCCEmails(
          row?.cc ??
          row?.CC ??
          row?.cc_emails ??
          row?.['CC Emails'] ??
          row?.['Cc Emails'] ??
          row?.ccEmails ??
          row?.recipients ??
          row?.Recipients ??
          row?.to ??
          row?.To ??
          row?.['To Emails']
        );

        let subject = '';
        const subjectCandidates = [
          row?.subject, row?.Subject, row?.title, row?.Title, row?.email_subject,
          row?.['Email Subject'], row?.mail_subject, row?.['Mail Subject'], row?.emailSubject
        ];
        for (const candidate of subjectCandidates) {
          if (candidate) {
            if (typeof candidate === 'string') { subject = candidate; break; }
            else if (candidate?.value) { subject = candidate.value; break; }
          }
        }
        subject = subject.replace(/<[^>]*>/g, '').trim();

        const bucket_name = row?.['Bucket Name'] ?? row?.bucket_name ?? '';
        const mail_content = getMailContent(row);

        return {
          id,
          created_at: String(created_at),
          pdf_url,
          status: status ? String(status) : undefined,
          document_data,
          raw: row,
          title,
          from_email,
          cc_emails,
          subject,
          bucket_name,
          mail_content,
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

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  const handleViewMailContent = (content: string) => {
    setSelectedMailContent(content);
    setIsMailDialogOpen(true);
  };

  const handleEditDocument = (docId: string) => {
    navigate(`/document/${docId}`);
  };

  const handleSelectDocument = (docId: string) => {
    setSelectedDocuments((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedDocuments((prev) => {
      if (prev.size === documents.length) return new Set();
      return new Set(documents.map((d) => d.id));
    });
  };

  const handleRefresh = () => {
    fetchDocuments();
    toast.success('Refreshing documents...');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="sticky top-0 z-10 h-16 shadow-sm bg-background/80 backdrop-blur-sm"
      >
        <DashboardHeader
          userEmail={user?.email || 'User'}
          isDarkMode={isDarkMode}
          onLogoClick={() => navigate('/')}
          onProfile={() => navigate('/profile')}
          onToggleDark={toggleDarkMode}
          onSignOut={handleSignOut}
        />
      </motion.header>

      <div className="flex-1 p-6 md:p-8 overflow-auto">
        <div className="max-w-full mx-auto">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight">Documents</h2>
            <Button
              onClick={handleRefresh}
              variant="outline"
              className="bg-white/5 hover:bg-white/10 border-white/10 backdrop-blur"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          <AnimatePresence>
            {selectedDocuments.size > 0 && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <BulkActionsBar
                  selectedIds={Array.from(selectedDocuments)}
                  userEmail={user?.email || 'anonymous'}
                  onProfile={() => navigate('/profile')}
                  onClearSelection={() => setSelectedDocuments(new Set())}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {!hasSupabaseEnv ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
              <div className="text-center py-12 space-y-4">
                <FileText className="h-16 w-16 mx-auto text-muted-foreground opacity-20" />
                <div className="text-lg font-medium">Supabase is not configured</div>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Add SUPABASE_URL and SUPABASE_ANON_KEY in the Integrations tab, then refresh.
                </p>
              </div>
            </motion.div>
          ) : isLoadingDocs ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : documents.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
              <div className="text-center py-12 space-y-4">
                <FileText className="h-16 w-16 mx-auto text-muted-foreground opacity-20" />
                <div className="text-lg font-medium">No documents found</div>
                <p className="text-sm text-muted-foreground">
                  Documents will appear here once added.
                </p>
              </div>
            </motion.div>
          ) : (
            <DocumentsTable
              docs={documents}
              selectedIds={selectedDocuments}
              onToggleSelectAll={handleSelectAll}
              onToggleSelect={handleSelectDocument}
              onViewMailContent={(content) => handleViewMailContent(content)}
              onViewDetails={(id) => navigate(`/document/${id}`)}
              onEdit={handleEditDocument}
            />
          )}
        </div>
      </div>

      <Dialog open={isMailDialogOpen} onOpenChange={setIsMailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-background/60 backdrop-blur-md border border-white/10">
          <DialogHeader>
            <DialogTitle>Email Content</DialogTitle>
            <DialogDescription>Full email message content</DialogDescription>
          </DialogHeader>
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: selectedMailContent || '' }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
