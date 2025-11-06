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

// Add robust helpers to normalize mail content into safe HTML
const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const textToHtml = (s: string) => {
  const safe = escapeHtml(s);
  // Convert double newlines to paragraphs and single newlines to <br/>
  return safe
    .split(/\n{2,}/)
    .map((para: string) => `<p>${para.replace(/\n/g, "<br/>")}</p>`)
    .join("");
};

const looksLikeJson = (s: string) => {
  const t = s.trim();
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
};

const tryParseJson = (s: string): any | null => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

const tryDecodeBase64 = (s: string): string | null => {
  try {
    // Remove whitespace that may be present in logged payloads
    const trimmed = s.replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/=]+$/.test(trimmed) || trimmed.length % 4 !== 0) return null;
    const decoded = atob(trimmed);
    // Check if mostly printable to avoid showing binary
    const printable = decoded.split("").filter((c) => /[\x09\x0A\x0D\x20-\x7E]/.test(c)).length;
    if (decoded.length === 0) return null;
    if (printable / decoded.length < 0.85) return null;
    return decoded;
  } catch {
    return null;
  }
};

// Prefer HTML fields, then plain text, then anything string-like
const pickMailField = (obj: any): string | undefined => {
  if (!obj || typeof obj !== "object") return undefined;

  const htmlKeys: string[] = [
    "html",
    "HTML",
    "body_html",
    "html_body",
    "content_html",
    "message_html",
    "bodyAsHtml",
  ];
  const textKeys: string[] = [
    "text",
    "Text",
    "plain",
    "plain_text",
    "body_text",
    "text_body",
    "textBody",
    "message",
    "Message",
    "body",
    "Body",
    "email_body",
    "Email Body",
    "emailBody",
    "bodyAsText",
    "content",
    "Content",
  ];

  for (const k of htmlKeys) {
    const v = (obj as any)[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  for (const k of textKeys) {
    const v = (obj as any)[k];
    if (typeof v === "string" && v.trim()) return v;
  }

  // Some providers wrap content in arrays or nested objects
  for (const k of Object.keys(obj)) {
    const v = (obj as any)[k];
    if (typeof v === "string" && v.trim()) return v;
    if (v && typeof v === "object") {
      const inner = pickMailField(v);
      if (inner) return inner;
    }
    if (Array.isArray(v)) {
      for (const item of v) {
        const inner = typeof item === "string" ? item : pickMailField(item);
        if (inner && String(inner).trim()) return String(inner);
      }
    }
  }

  return undefined;
};

const getMailContent = (row: any): string => {
  const directKeys: Array<string> = [
    "mail_content",
    "Mail Content",
    "Mail content",
    "mail content",
    "mailContent",
    "html",
    "HTML",
    "body",
    "Body",
    "content",
    "Content",
    "message",
    "Message",
    "text",
    "Text",
    "email_body",
    "Email Body",
    "emailBody",
    "body_html",
    "html_body",
    "content_html",
    "message_html",
    "body_text",
    "text_body",
    "textBody",
    "plain_text",
    "bodyAsHtml",
    "bodyAsText",
    "raw", // sometimes raw payload holds the body
  ];

  const containers = ["data", "payload", "mail", "email", "message", "raw"];

  const normalizeAnyToHtml = (val: any): string => {
    if (val == null) return "";
    if (typeof val === "string") {
      const s = val.trim();
      if (!s) return "";
      // JSON-encoded string?
      if (looksLikeJson(s)) {
        const parsed = tryParseJson(s);
        if (parsed) return normalizeAnyToHtml(parsed);
      }
      // Base64-encoded?
      const maybeDecoded = tryDecodeBase64(s);
      if (maybeDecoded) {
        // If decoded contains HTML tags, use as-is; else treat as text
        if (/[<>]/.test(maybeDecoded)) return maybeDecoded;
        return textToHtml(maybeDecoded);
      }
      // If contains HTML tags, treat as HTML; otherwise treat as plain text
      if (/[<>]/.test(s)) return s;
      return textToHtml(s);
    }
    if (Array.isArray(val)) {
      const joined = val
        .map((item) => (typeof item === "string" ? item : pickMailField(item) ?? ""))
        .filter(Boolean)
        .join("\n\n");
      return normalizeAnyToHtml(joined);
    }
    if (typeof val === "object") {
      const picked = pickMailField(val);
      if (picked) return normalizeAnyToHtml(picked);
      // last resort stringify
      try {
        return textToHtml(JSON.stringify(val, null, 2));
      } catch {
        return "";
      }
    }
    // numbers/booleans
    return textToHtml(String(val));
  };

  // 1) Try direct keys on row
  for (const k of directKeys) {
    const candidate = row?.[k];
    if (candidate == null) continue;
    const html = normalizeAnyToHtml(candidate);
    if (html) return html;
  }

  // 2) Try common nested containers
  for (const c of containers) {
    const nested = row?.[c];
    if (!nested) continue;

    // direct pick within the container
    const picked = pickMailField(nested);
    if (picked) {
      const html = normalizeAnyToHtml(picked);
      if (html) return html;
    }

    // scan deeper
    const html = normalizeAnyToHtml(nested);
    if (html) return html;
  }

  // 3) Full object scan as fallback
  const fallback = pickMailField(row);
  if (fallback) {
    const html = normalizeAnyToHtml(fallback);
    if (html) return html;
  }

  return "";
};

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
    const root = document.documentElement;
    root.classList.remove('dark', 'glass-theme');
    // Safely read a potential theme string without type errors
    const theme = (user as any)?.theme as string | undefined;
    if (theme === 'dark') {
      root.classList.add('dark');
      setIsDarkMode(true);
    } else {
      root.classList.add('glass-theme');
      setIsDarkMode(false);
    }
  }, [user]);

  useEffect(() => {
    // Preload the Document Detail route to make navigation snappy
    import("@/pages/DocumentDetail.tsx").catch(() => {});
  }, []);

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

  const openDocumentWithOrder = (docId: string) => {
    try {
      const order = documents.map((d) => d.id);
      localStorage.setItem('nav_order', JSON.stringify(order));
      localStorage.setItem('nav_context', 'documents');
    } catch {
      // ignore storage errors
    }
    navigate(`/document/${docId}`);
  };

  const handleEditDocument = (docId: string) => {
    openDocumentWithOrder(docId);
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

      <div className="flex-1 overflow-hidden p-0">
        <div className="w-full">
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
              onViewDetails={(id) => openDocumentWithOrder(id)}
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