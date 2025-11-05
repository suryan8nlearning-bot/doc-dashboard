import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/use-auth';
import { supabase, hasSupabaseEnv, publicUrlForPath } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Loader2, LogOut, Mail, Trash2, User, Moon, Sun, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
 // removed status filter select import
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import * as SalesSchema from "@/schemas/salesOrderCreate";
import { DocumentsTable } from "@/components/dashboard/DocumentsTable";

export default function Dashboard() {
  // Redirect to Documents page immediately (no initial dashboard screen)
  if (typeof window !== "undefined") {
    window.location.replace("/documents");
    return null;
  }

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
  // Add: navigation loading state for "View Documents"
  const [isNavToDocsLoading, setIsNavToDocsLoading] = useState(false);
  // Add: inline documents panel visibility
  const [showDocsInline, setShowDocsInline] = useState(false);
  // Add: prefetch Documents page chunk for faster navigation
  const prefetchDocuments = () => {
    // Silently prefetch, ignore errors to prevent blocking navigation
    import('@/pages/Documents').catch((err) => {
      console.warn('Prefetch failed (non-blocking):', err);
    });
  };

  // Add MotionTableRow for animating rows
  const MotionTableRow = motion(TableRow);

  // Replace: openTable navigate handler to toggle inline docs panel instead of route navigation
  const openTable = () => {
    if (isNavToDocsLoading) return;
    // When opening inline, show a brief loading spinner for smoothness
    if (!showDocsInline) {
      setIsNavToDocsLoading(true);
      // warm up chunk/data as before (non-blocking)
      prefetchDocuments();
      prefetchDocumentsChunk();
      setTimeout(() => {
        setIsNavToDocsLoading(false);
        setShowDocsInline(true);
      }, 200);
    } else {
      setShowDocsInline(false);
    }
  };

  // Add: idle-callback helper to safely prefetch without blocking
  const ric = (cb: () => void) =>
    typeof (window as any).requestIdleCallback === "function"
      ? (window as any).requestIdleCallback(cb)
      : setTimeout(cb, 1);

  // Add: keep a single prefetch promise so chunk loads only once
  const docsChunkPreload = useRef<Promise<any> | null>(null);

  // Add: prefetch the /documents route chunk (avoid on very slow networks)
  const prefetchDocumentsChunk = () => {
    try {
      const conn = (navigator as any)?.connection?.effectiveType as string | undefined;
      if (conn && (conn.includes("2g") || conn === "slow-2g")) return;
      if (!docsChunkPreload.current) {
        docsChunkPreload.current = import("@/pages/Documents").catch((err) => {
          console.warn('Documents chunk prefetch failed:', err);
          return null;
        });
      }
      return docsChunkPreload.current;
    } catch (err) {
      console.warn('Prefetch error:', err);
      return null;
    }
  };

  // Add: warm up a lightweight first-page query to improve perceived load time
  const prefetchDocumentsFirstPage = () => {
    try {
      // relies on existing hasSupabaseEnv and supabase imports in this file
      if (!hasSupabaseEnv) return;
      const cacheKey = "prefetch:documents:firstPage:v1";
      if (sessionStorage.getItem(cacheKey)) return;

      supabase
        .from("N8N Logs")
        .select("id, title, status, created_at")
        .order("created_at", { ascending: false })
        .limit(50)
        .then(
          (res) => {
            if (!res.error && res.data) {
              sessionStorage.setItem(cacheKey, "1");
            }
          },
          () => {
            // ignore warm-up errors
          }
        );
    } catch {
      // ignore
    }
  };

  // Add: idle prefetch on mount (no UI changes, just speeds up first navigation)
  useEffect(() => {
    ric(() => {
      prefetchDocumentsChunk();
      prefetchDocumentsFirstPage();
    });
  }, []);

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
    // Enhanced: handle JSON strings, objects, arrays, and various shapes
    const extractEmail = (item: any): string => {
      if (!item) return "";
      if (typeof item === "string") return item;
      if (typeof item === "object") {
        return item.value || item.address || item.email || "";
      }
      return "";
    };

    // If it's already an array, map it
    if (Array.isArray(field)) {
      return field.map(extractEmail).filter(Boolean);
    }

    // If it's a string, try JSON parse first; otherwise comma split
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
            const single =
              parsed.value || parsed.address || parsed.email;
            if (single) return [String(single)].filter(Boolean);
          }
        } catch {
          // fall through to comma split
        }
      }
      return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
    }

    // If it's an object, extract common arrays/fields
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

      const single =
        field.value || field.address || field.email;
      if (single) return [String(single)].filter(Boolean);
    }

    return [];
  };

  // Extract mail content from multiple possible fields and shapes
  const getMailContent = (row: any): string => {
    const keys: Array<string> = [
      "mail_content",
      "Mail Content",
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
    ];

    const readFromObject = (obj: any): string | undefined => {
      if (!obj || typeof obj !== "object") return undefined;
      // direct keys
      for (const k of ["html", "HTML", "body", "Body", "text", "Text", "content", "Content", "message", "Message"]) {
        const v = obj[k];
        if (typeof v === "string" && v.trim().length) return v;
      }
      // nested under data
      if (obj.data && typeof obj.data === "object") {
        for (const k of ["html", "HTML", "body", "Body", "text", "Text", "content", "Content", "message", "Message"]) {
          const v = obj.data[k];
          if (typeof v === "string" && v.trim().length) return v;
        }
      }
      return undefined;
    };

    // scan candidate keys on the row
    for (const k of keys) {
      const candidate = row?.[k];
      if (candidate == null) continue;

      if (typeof candidate === "string") {
        const s = candidate.trim();
        // Try JSON if it looks like JSON
        if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
          try {
            const parsed = JSON.parse(s);
            const fromParsed = readFromObject(parsed);
            if (fromParsed) return fromParsed;
          } catch {
            // not json, fall through
          }
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

  // Add helpers to derive schema order and reorder objects for SAP grouping
  // Place near other helper functions (after extractSap is defined is fine)
  // Derive order tree from JSON Schema or Zod-like schemas
  const deriveOrderTreeFromSchema = (schemaMod: any): any => {
    const candidates = [
      schemaMod?.fieldOrderTree,
      schemaMod?.orderTree,
      schemaMod?.schemaOrder,
      schemaMod?.salesOrderCreate,
      schemaMod?.SalesOrderCreate,
      schemaMod?.salesOrderSchema,
      schemaMod?.SalesOrderSchema,
      schemaMod?.salesOrderCreateSchema,
      schemaMod?.default,
    ].filter(Boolean);

    const visit = (node: any): any => {
      if (!node) return null;

      if (typeof node === "object") {
        if (node.type === "object" && node.properties && typeof node.properties === "object") {
          const out: Record<string, any> = {};
          for (const k of Object.keys(node.properties)) {
            out[k] = visit(node.properties[k]);
          }
          return out;
        }
        if (node.type === "array" && node.items) {
          return [visit(node.items)];
        }
      }

      try {
        const def = (node as any)?._def;
        const shape = typeof def?.shape === "function" ? def.shape() : def?.shape;
        if (shape && typeof shape === "object") {
          const out: Record<string, any> = {};
          for (const k of Object.keys(shape)) out[k] = visit((shape as any)[k]);
          return out;
        }
      } catch {
        // ignore
      }

      if (typeof node === "object" && !Array.isArray(node)) {
        const out: Record<string, any> = {};
        for (const k of Object.keys(node)) out[k] = visit((node as any)[k]);
        return out;
      }

      if (Array.isArray(node)) {
        return node.length > 0 ? [visit(node[0])] : [];
      }

      return null;
    };

    for (const cand of candidates) {
      const tree = visit(cand);
      if (tree && typeof tree === "object") return tree;
    }
    return null;
  };

  // Reorder any value to follow the order tree
  const reorderByOrderTree = (value: any, orderTree: any): any => {
    if (!orderTree) return value;

    if (Array.isArray(value)) {
      const elemTree = Array.isArray(orderTree) ? orderTree[0] : orderTree;
      return value.map((v) => reorderByOrderTree(v, elemTree));
    }

    if (value !== null && typeof value === "object") {
      const ordered: Record<string, any> = {};
      const orderKeys = Array.isArray(orderTree) ? [] : Object.keys(orderTree ?? {});
      const seen = new Set<string>();

      for (const k of orderKeys) {
        if (k in (value as any)) {
          ordered[k] = reorderByOrderTree((value as any)[k], (orderTree ?? {})[k]);
          seen.add(k);
        }
      }

      for (const k of Object.keys(value as any)) {
        if (!seen.has(k)) {
          ordered[k] = reorderByOrderTree((value as any)[k], undefined);
        }
      }

      return ordered;
    }

    return value;
  };

  // Memoize schema order tree once
  const orderTree = useMemo(() => deriveOrderTreeFromSchema(SalesSchema), []);

  // Shrink and wrap SAP KV rows for denser display
  function KV({ label, value }: { label: string; value: any }) {
    return (
      <div className="rounded-sm border border-border/60 p-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
        <div className="text-sm font-medium whitespace-pre-wrap break-words">
          {String(value ?? "—")}
        </div>
      </div>
    );
  }

  // Render grouped SAP payload
  const renderSap = (out: any) => {
    if (!out || typeof out !== 'object') {
      return <div className="text-sm text-muted-foreground">No SAP data.</div>;
    }

    // Use schema order for the output object (use output-level if present)
    const s = orderTree ? reorderByOrderTree(out, (orderTree as any)?.output ?? orderTree) : out;

    const headerIgnore = new Set(['to_Partner', 'to_PricingElement', 'to_Item']);
    const headerPairs = Object.entries(s).filter(
      ([k, v]) =>
        !headerIgnore.has(k) &&
        (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    );

    return (
      <div className="space-y-6">
        <div>
          <div className="font-semibold mb-2">Header</div>
          {headerPairs.length ? (
            <div
              // apply dynamic min column width; fields will flow as the space changes
              style={{ ["--minCol" as any]: `${fieldMin}px` }}
              className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(var(--minCol,220px),1fr))]"
            >
              {headerPairs.map(([k, v]) => (
                <KV key={k} label={k} value={v} />
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No header fields.</div>
          )}
        </div>

        {Array.isArray(s?.to_Partner) && (
          <div>
            <div className="font-semibold mb-2">Partners</div>
            <div className="space-y-2">
              {s.to_Partner.map((p: any, idx: number) => (
                <div key={idx} className="rounded-sm border border-white/10 p-2">
                  <div className="text-[11px] text-muted-foreground mb-1">Partner {idx + 1}</div>
                  <div className="grid [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))] gap-1.5">
                    {Object.entries(p || {}).map(([k, v]) => (
                      <div key={k} className="flex items-start justify-between rounded-sm bg-card/40 p-1.5 gap-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
                        <div className="text-[12px] font-medium leading-snug whitespace-pre-wrap break-words">
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

        {Array.isArray(s?.to_PricingElement) && (
          <div>
            <div className="font-semibold mb-2">Header Pricing</div>
            <div className="space-y-2">
              {s.to_PricingElement.map((pe: any, idx: number) => (
                <div key={idx} className="rounded-sm border border-white/10 p-2">
                  <div className="text-[11px] text-muted-foreground mb-1">Pricing {idx + 1}</div>
                  <div className="grid [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))] gap-1.5">
                    {Object.entries(pe || {}).map(([k, v]) => (
                      <div key={k} className="flex items-start justify-between rounded-sm bg-card/40 p-1.5 gap-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
                        <div className="text-[12px] font-medium leading-snug whitespace-pre-wrap break-words">
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

        {Array.isArray(s?.to_Item) && (
          <div>
            <div className="font-semibold mb-2">Items</div>
            <div className="space-y-3">
              {s.to_Item.map((it: any, idx: number) => {
                const partners = Array.isArray(it?.to_ItemPartner) ? it.to_ItemPartner : [];
                const prices = Array.isArray(it?.to_ItemPricingElement) ? it.to_ItemPricingElement : [];
                const itemHeaderPairs = Object.entries(it || {}).filter(
                  ([k, v]) =>
                    !['to_ItemPartner', 'to_ItemPricingElement'].includes(k) &&
                    (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
                );
                return (
                  <div key={idx} className="rounded-sm border border-white/10 p-2 space-y-2">
                    <div className="text-[11px] text-muted-foreground">Item {idx + 1}</div>
                    <div className="grid [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))] gap-1.5">
                      {itemHeaderPairs.map(([k, v]) => (
                        <div key={k} className="flex items-start justify-between rounded-sm bg-card/40 p-1.5 gap-2">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
                          <div className="text-[12px] font-medium leading-snug whitespace-pre-wrap break-words">
                            {String(v ?? '—')}
                          </div>
                        </div>
                      ))}
                    </div>

                    {partners.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium">Item Partners</div>
                        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))] gap-1.5">
                          {partners.map((p: any, pi: number) => (
                            <div key={pi} className="rounded-sm border border-white/10 p-2">
                              <div className="grid grid-cols-1 gap-1">
                                {Object.entries(p || {}).map(([k, v]) => (
                                  <div key={k} className="flex items-start justify-between gap-2">
                                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</span>
                                    <span className="text-[12px] font-medium leading-snug whitespace-pre-wrap break-words">
                                      {String(v ?? '—')}
                                    </span>
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
                        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))] gap-1.5">
                          {prices.map((pr: any, ri: number) => (
                            <div key={ri} className="rounded-sm border border-white/10 p-2">
                              <div className="grid grid-cols-1 gap-1">
                                {Object.entries(pr || {}).map(([k, v]) => (
                                  <div key={k} className="flex items-start justify-between gap-2">
                                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</span>
                                    <span className="text-[12px] font-medium leading-snug whitespace-pre-wrap break-words">
                                      {String(v ?? '—')}
                                    </span>
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
        
        // Enhanced mail content parsing with JSON/object support
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

  // Edit and Delete handlers for inline actions
  const handleEditDocument = (docId: string) => {
    navigate(`/document/${docId}`);
  };

  const handleDeleteDocument = async (docId: string) => {
    const confirmed = window.confirm("Delete this document? This cannot be undone.");
    if (!confirmed) return;

    let deletedFromSupabase = false;
    try {
      if (hasSupabaseEnv) {
        // Try common ID columns
        for (const col of ["id", "uuid", "_id"]) {
          const { error } = await supabase.from("N8N Logs").delete().eq(col, docId);
          if (!error) {
            deletedFromSupabase = true;
            break;
          }
        }
      }
      // Optimistically update UI
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      setSelectedDocuments((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
      toast.success(deletedFromSupabase ? "Document deleted." : "Removed from view.");
    } catch (e) {
      console.error("Delete failed:", e);
      toast.error("Failed to delete document.");
    }
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

  // Add derived metrics and handlers for header/actions
  const totalDocs = documents.length;
  const processedDocs = documents.filter((d) => {
    const s = (d.status ?? '').toLowerCase();
    return s.includes('process') || s.includes('success') || s.includes('done') || s.includes('complete');
  }).length;
  const inProgressDocs = documents.filter((d) => {
    const s = (d.status ?? '').toLowerCase();
    return s.includes('pending') || s.includes('queue') || s.includes('progress');
  }).length;
  const last24hDocs = documents.filter((d) => {
    const created = new Date(d.created_at);
    return Date.now() - created.getTime() < 24 * 60 * 60 * 1000;
  }).length;
  const processedPct = totalDocs ? Math.round((processedDocs / totalDocs) * 100) : 0;

  const handleNewUpload = () => {
    // Keep simple and non-destructive; guide user
    toast.info('New upload flow is managed via your existing ingestion. Use the Landing/SAP tools or your pipeline.');
  };
  const handleRefresh = () => {
    fetchDocuments();
    toast.success('Refreshing documents...');
  };

  // Fixed min column width for SAP dialog on Dashboard (no UI controls)
  const fieldMin = 240;

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

      {/* Main Content */}
      <div className="flex-1 p-8 overflow-auto scroll-smooth">
        <div className="max-w-full mx-auto">
          {/* New concise header + controls */}
          <div className="mb-6 space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Doc Dashboard</h2>
                <p className="text-sm text-muted-foreground">Overview of your documents and activity</p>
              </div>
              <div className="flex items-center gap-3">
                {/* removed status filter button */}
                <Button
                  onClick={handleRefresh}
                  variant="outline"
                  className="bg-white/5 hover:bg-white/10 border-white/10 backdrop-blur"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Button
                  onClick={openTable}
                  onMouseEnter={prefetchDocuments}
                  onFocus={prefetchDocuments}
                  onTouchStart={prefetchDocuments}
                  className="shadow-sm"
                  disabled={isNavToDocsLoading}
                  aria-busy={isNavToDocsLoading}
                >
                  {isNavToDocsLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4 mr-2" />
                  )}
                  {isNavToDocsLoading ? 'Opening...' : 'View Documents'}
                </Button>
              </div>
            </div>

            {/* Widgets grid */}
            {!isLoadingDocs ? null : (
              <>
                {isLoadingDocs ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    <Card className="rounded-2xl shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Total Documents</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Skeleton className="h-8 w-24 mb-3" />
                        <Skeleton className="h-2 w-full rounded-full" />
                      </CardContent>
                    </Card>
                    <Card className="rounded-2xl shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Processed</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Skeleton className="h-8 w-24 mb-3" />
                        <Skeleton className="h-2 w-full rounded-full" />
                      </CardContent>
                    </Card>
                    <Card className="rounded-2xl shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">New (24h)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Skeleton className="h-8 w-24 mb-3" />
                        <Skeleton className="h-2 w-full rounded-full" />
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {/* Total Documents */}
                    <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.995 }} className="h-full">
                      <Card className="rounded-2xl shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm text-muted-foreground">Total Documents</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <FileText className="h-5 w-5 text-primary" />
                            </div>
                            <div className="text-3xl font-semibold">{totalDocs}</div>
                          </div>
                          <div className="text-xs text-muted-foreground mb-1">{processedPct}% processed</div>
                          <Progress value={processedPct} />
                        </CardContent>
                      </Card>
                    </motion.div>

                    {/* Processed */}
                    <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.995 }} className="h-full">
                      <Card className="rounded-2xl shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm text-muted-foreground">Processed</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-lg bg-emerald-500/10">
                              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                            </div>
                            <div className="text-3xl font-semibold">{processedDocs}</div>
                          </div>
                          <div className="text-xs text-muted-foreground mb-1">In progress: {inProgressDocs}</div>
                          <Progress value={Math.min(100, (inProgressDocs / (totalDocs || 1)) * 100)} />
                        </CardContent>
                      </Card>
                    </motion.div>

                    {/* New in last 24h */}
                    <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.995 }} className="h-full">
                      <Card className="rounded-2xl shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm text-muted-foreground">New (24h)</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-lg bg-amber-500/10">
                              <Clock className="h-5 w-5 text-amber-500" />
                            </div>
                            <div className="text-3xl font-semibold">{last24hDocs}</div>
                          </div>
                          <div className="text-xs text-muted-foreground mb-1">Activity trend</div>
                          <Progress value={Math.min(100, (last24hDocs / Math.max(1, totalDocs)) * 100)} />
                        </CardContent>
                      </Card>
                    </motion.div>

                    {/* Recent Documents */}
                    <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.995 }} className="h-full md:col-span-2 xl:col-span-1">
                      <Card className="rounded-2xl shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm text-muted-foreground">Recent Documents</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {documents.slice(0, 5).map((d) => (
                            <div key={d.id} className="flex items-center justify-between">
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{d.subject || d.title || d.bucket_name || d.id}</div>
                                <div className="text-xs text-muted-foreground truncate">{d.from_email || '—'}</div>
                              </div>
                              <div className="ml-3 text-xs px-2 py-1 rounded-full bg-white/5 border border-white/10">
                                {(d.status || '—')}
                              </div>
                            </div>
                          ))}
                          {documents.length === 0 && <div className="text-sm text-muted-foreground">No documents yet.</div>}
                        </CardContent>
                      </Card>
                    </motion.div>

                    {/* Quick Actions */}
                    <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.995 }} className="h-full">
                      <Card className="rounded-2xl shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm text-muted-foreground">Quick Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-wrap gap-3">
                          <Button
                            onClick={openTable}
                            onMouseEnter={prefetchDocuments}
                            onFocus={prefetchDocuments}
                            onTouchStart={prefetchDocuments}
                            className="shadow-sm"
                            disabled={isNavToDocsLoading}
                            aria-busy={isNavToDocsLoading}
                          >
                            {isNavToDocsLoading ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <FileText className="h-4 w-4 mr-2" />
                            )}
                            {isNavToDocsLoading ? 'Opening...' : 'View Documents'}
                          </Button>
                          <Button
                            onClick={handleRefresh}
                            variant="outline"
                            className="bg-white/5 hover:bg-white/10 border-white/10 backdrop-blur"
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Refresh
                          </Button>
                        </CardContent>
                      </Card>
                    </motion.div>
                  </div>
                )}
              </>
            )}

            {/* Selection bar remains */}
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

            {/* Inline Documents view */}
            <AnimatePresence>
              {showDocsInline && (
                <motion.section
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="mt-4 rounded-2xl border border-white/10 bg-background/60 backdrop-blur-md p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <h3 className="text-base font-semibold">Documents</h3>
                      <span className="text-xs text-muted-foreground">({documents.length})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="bg-white/5 hover:bg-white/10 border-white/10"
                        onClick={() => navigate('/documents')}
                      >
                        Open full page
                      </Button>
                      <Button variant="ghost" onClick={() => setShowDocsInline(false)}>
                        Hide
                      </Button>
                    </div>
                  </div>

                  {!hasSupabaseEnv ? (
                    <div className="text-center py-10 space-y-2">
                      <FileText className="h-10 w-10 mx-auto text-muted-foreground opacity-30" />
                      <div className="text-sm font-medium">Supabase is not configured</div>
                      <p className="text-xs text-muted-foreground">Add SUPABASE_URL and SUPABASE_ANON_KEY in the Integrations tab, then refresh.</p>
                    </div>
                  ) : isLoadingDocs ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : documents.length === 0 ? (
                    <div className="text-center py-10 space-y-2">
                      <FileText className="h-10 w-10 mx-auto text-muted-foreground opacity-30" />
                      <div className="text-sm font-medium">No documents found</div>
                      <p className="text-xs text-muted-foreground">Documents will appear here once added.</p>
                    </div>
                  ) : (
                    <DocumentsTable
                      docs={documents}
                      selectedIds={selectedDocuments}
                      onToggleSelectAll={handleSelectAll}
                      onToggleSelect={handleSelectDocument}
                      onViewMailContent={(content) => handleViewMailContent(content)}
                      onViewDetails={(id) => handleEditDocument(id)}
                      onEdit={handleEditDocument}
                    />
                  )}
                </motion.section>
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
          ) : null}
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