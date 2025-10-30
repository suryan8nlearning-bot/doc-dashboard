import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/use-auth';
import { supabase, hasSupabaseEnv, publicUrlForPath } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Loader2, LogOut, Mail, Trash2, User, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { BulkActionsBar } from "@/components/dashboard/BulkActionsBar";
import { DocumentsTable } from "@/components/dashboard/DocumentsTable";

export default function Dashboard() {
  const { isLoading: authLoading, isAuthenticated, user, signOut } = useAuth();
  const navigate = useNavigate();
  const sendWebhook = useAction(api.webhooks.sendWebhook);

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
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedMailContent, setSelectedMailContent] = useState<string | null>(null);
  const [isMailDialogOpen, setIsMailDialogOpen] = useState(false);
  const [isSAPDialogOpen, setIsSAPDialogOpen] = useState(false);
  const [selectedSAP, setSelectedSAP] = useState<any | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Add MotionTableRow for animating rows
  const MotionTableRow = motion(TableRow);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/auth');
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Apply user's saved theme on mount
  useEffect(() => {
    if (user?.theme) {
      const root = document.documentElement;
      root.classList.remove('dark', 'glass-theme');
      
      if (user.theme === 'glass') {
        root.classList.add('glass-theme');
      } else if (user.theme === 'dark') {
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
    if (!field) return [];
    if (Array.isArray(field)) {
      return field.map((item: any) => {
        if (typeof item === 'string') return item;
        if (item?.value) return item.value;
        if (item?.address) return item.address;
        if (item?.email) return item.email;
        return '';
      }).filter(Boolean);
    }
    if (typeof field === 'string') {
      return field.split(',').map(s => s.trim()).filter(Boolean);
    }
    // Handle object with nested properties
    if (typeof field === 'object' && field !== null) {
      if (field.value) return [field.value];
      if (field.address) return [field.address];
      if (field.email) return [field.email];
    }
    return [];
  };

  /**
   * Extracts SAP output object from a row. Accepts multiple field name variants and string/object inputs.
   * Returns the "output" object if present, otherwise the parsed object itself.
   */
  const extractSapOutput = (row: any): any | undefined => {
    if (!row) return undefined;
    const candidates: Array<any> = [
      row?.SAP_AI_OUTPUT,
      row?.sap_ai_output,
      row?.['SAP_AI_OUTPUT'],
      row?.sap_payload,
      row?.SAP,
      row?.sap,
    ];
    for (const cand of candidates) {
      if (!cand) continue;
      try {
        const obj = typeof cand === 'string' ? JSON.parse(cand) : cand;
        const out = obj?.output ?? obj;
        if (out && typeof out === 'object') return out;
      } catch {
        // ignore parse errors
      }
    }
    return undefined;
  };

  // Renders a simple field row for key/value
  const KV = ({ label, value }: { label: string; value: any }) => (
    <div className="flex items-center justify-between rounded border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium max-w-[60%] truncate" title={String(value)}>
        {String(value ?? '—')}
      </div>
    </div>
  );

  // Render grouped SAP payload
  const renderSap = (out: any) => {
    if (!out || typeof out !== 'object') {
      return <div className="text-sm text-muted-foreground">No SAP data.</div>;
    }
    const headerIgnore = new Set(['to_Partner', 'to_PricingElement', 'to_Item']);
    const headerPairs = Object.entries(out).filter(
      ([k, v]) =>
        !headerIgnore.has(k) &&
        (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    );

    return (
      <div className="space-y-6">
        <div>
          <div className="font-semibold mb-2">Header</div>
          {headerPairs.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {headerPairs.map(([k, v]) => (
                <KV key={k} label={k} value={v} />
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No header fields.</div>
          )}
        </div>

        {Array.isArray(out?.to_Partner) && (
          <div>
            <div className="font-semibold mb-2">Partners</div>
            <div className="space-y-2">
              {out.to_Partner.map((p: any, idx: number) => (
                <div key={idx} className="rounded border p-2">
                  <div className="text-xs text-muted-foreground mb-1">Partner {idx + 1}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {Object.entries(p || {}).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between rounded bg-card/50 p-2">
                        <div className="text-xs text-muted-foreground">{k}</div>
                        <div className="text-sm font-medium max-w-[60%] truncate" title={String(v)}>
                          {String(v ?? '—')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {Array.isArray(out?.to_PricingElement) && (
          <div>
            <div className="font-semibold mb-2">Header Pricing</div>
            <div className="space-y-2">
              {out.to_PricingElement.map((pe: any, idx: number) => (
                <div key={idx} className="rounded border p-2">
                  <div className="text-xs text-muted-foreground mb-1">Pricing {idx + 1}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {Object.entries(pe || {}).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between rounded bg-card/50 p-2">
                        <div className="text-xs text-muted-foreground">{k}</div>
                        <div className="text-sm font-medium max-w-[60%] truncate" title={String(v)}>
                          {String(v ?? '—')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {Array.isArray(out?.to_Item) && (
          <div>
            <div className="font-semibold mb-2">Items</div>
            <div className="space-y-3">
              {out.to_Item.map((it: any, idx: number) => {
                const partners = Array.isArray(it?.to_ItemPartner) ? it.to_ItemPartner : [];
                const prices = Array.isArray(it?.to_ItemPricingElement) ? it.to_ItemPricingElement : [];
                const itemHeaderPairs = Object.entries(it || {}).filter(
                  ([k, v]) =>
                    !['to_ItemPartner', 'to_ItemPricingElement'].includes(k) &&
                    (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
                );
                return (
                  <div key={idx} className="rounded border p-2 space-y-2">
                    <div className="text-xs text-muted-foreground">Item {idx + 1}</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {itemHeaderPairs.map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between rounded bg-card/50 p-2">
                          <div className="text-xs text-muted-foreground">{k}</div>
                          <div className="text-sm font-medium max-w-[60%] truncate" title={String(v)}>
                            {String(v ?? '—')}
                          </div>
                        </div>
                      ))}
                    </div>

                    {partners.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium">Item Partners</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {partners.map((p: any, pi: number) => (
                            <div key={pi} className="rounded border p-2">
                              <div className="grid grid-cols-1 gap-1">
                                {Object.entries(p || {}).map(([k, v]) => (
                                  <div key={k} className="flex items-center justify-between">
                                    <span className="text-[11px] text-muted-foreground">{k}</span>
                                    <span className="text-sm font-medium">{String(v ?? '—')}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {prices.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium">Item Pricing</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {prices.map((pr: any, ri: number) => (
                            <div key={ri} className="rounded border p-2">
                              <div className="grid grid-cols-1 gap-1">
                                {Object.entries(pr || {}).map(([k, v]) => (
                                  <div key={k} className="flex items-center justify-between">
                                    <span className="text-[11px] text-muted-foreground">{k}</span>
                                    <span className="text-sm font-medium">{String(v ?? '—')}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
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
        
        // Enhanced CC parsing with more field variations
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
        
        // Enhanced subject parsing with more field variations and better handling
        let subject = '';
        const subjectCandidates = [
          row?.subject,
          row?.Subject,
          row?.title,
          row?.Title,
          row?.email_subject,
          row?.['Email Subject'],
          row?.mail_subject,
          row?.['Mail Subject'],
          row?.emailSubject
        ];
        
        for (const candidate of subjectCandidates) {
          if (candidate) {
            if (typeof candidate === 'string') {
              subject = candidate;
              break;
            } else if (candidate?.value) {
              subject = candidate.value;
              break;
            }
          }
        }
        
        // Strip HTML tags and trim
        subject = subject.replace(/<[^>]*>/g, '').trim();
        
        const bucket_name = row?.['Bucket Name'] ?? row?.bucket_name ?? '';
        
        // Enhanced mail content parsing with more field variations
        const mail_content = 
          row?.mail_content ?? 
          row?.['Mail Content'] ?? 
          row?.['mail content'] ?? 
          row?.mailContent ?? 
          row?.html ?? 
          row?.HTML ?? 
          row?.body ?? 
          row?.Body ?? 
          row?.content ?? 
          row?.Content ?? 
          row?.message ?? 
          row?.Message ?? 
          row?.text ?? 
          row?.Text ??
          row?.email_body ??
          row?.['Email Body'] ??
          row?.emailBody ??
          '';

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

  const handleSelectDocument = (docId: string) => {
    setSelectedDocuments((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedDocuments.size === filteredDocs.length) {
      setSelectedDocuments(new Set());
    } else {
      setSelectedDocuments(new Set(filteredDocs.map((d) => d.id)));
    }
  };

  const truncateText = (text: string, maxLength: number = 50) => {
    if (!text) return '—';
    const stripped = text.replace(/<[^>]*>/g, '');
    return stripped.length > maxLength ? stripped.substring(0, maxLength) + '...' : stripped;
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
    <div className="min-h-screen flex flex-col bg-background scroll-smooth">
      {/* Header */}
      <motion.header initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }} className="sticky top-0 z-10 border-b bg-background/50 backdrop-blur-md">
        <DashboardHeader
          userEmail={user?.email || 'User'}
          isDarkMode={isDarkMode}
          onLogoClick={() => navigate('/')}
          onProfile={() => navigate('/profile')}
          onToggleDark={toggleDarkMode}
          onSignOut={handleSignOut}
        />
      </motion.header>

      {/* Main Content */}
      <div className="flex-1 p-8 overflow-auto scroll-smooth">
        <div className="max-w-full mx-auto">
          <div className="mb-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold tracking-tight">Documents</h2>
              {uniqueStatuses.length > 0 && (
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-56 bg-background/50 backdrop-blur border-white/10">
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
            <AnimatePresence>
              {selectedDocuments.size > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <BulkActionsBar
                    selectedIds={Array.from(selectedDocuments)}
                    userEmail={user?.email || 'anonymous'}
                    onProfile={() => navigate('/profile')}
                    onClearSelection={() => setSelectedDocuments(new Set())}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

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
          ) : filteredDocs.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
              <div className="text-center py-12 space-y-4">
              <FileText className="h-16 w-16 mx-auto text-muted-foreground opacity-20" />
              <div className="text-lg font-medium">No documents found</div>
                <p className="text-sm text-muted-foreground">
                  {statusFilter !== 'ALL' ? 'Try changing the status filter' : 'Documents will appear here once added'}
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
              <DocumentsTable
                docs={filteredDocs}
                selectedIds={selectedDocuments}
                onToggleSelectAll={handleSelectAll}
                onToggleSelect={handleSelectDocument}
                onViewMailContent={handleViewMailContent}
                onViewDetails={(id: string) => navigate(`/document/${id}`)}
              />
            </motion.div>
          )}
        </div>
      </div>

      {/* Mail Content Dialog */}
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

      {/* SAP Payload Dialog */}
      <Dialog open={isSAPDialogOpen} onOpenChange={setIsSAPDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-background/60 backdrop-blur-md border border-white/10">
          <DialogHeader>
            <DialogTitle>SAP Payload</DialogTitle>
            <DialogDescription>Sales Order Create Payload (grouped)</DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {selectedSAP ? renderSap(selectedSAP) : (
              <div className="text-sm text-muted-foreground">No SAP data.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}