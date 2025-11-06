import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { motion } from "framer-motion";
import { Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, ArrowUpDown, ChevronRight, Loader2, Pencil } from "lucide-react";
import { SlidersHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ReactNode, useMemo, useState, useDeferredValue } from "react";
import { Switch } from "@/components/ui/switch";
import { useEffect } from "react";

const MotionTableRow = motion(TableRow);

type DocsRow = {
  id: string;
  created_at?: string;
  status?: string;
  from_email?: string;
  cc_emails?: string[];
  subject?: string;
  title?: string;
  bucket_name?: string;
  mail_content?: string;
};

type DocumentsTableProps = {
  docs: Array<DocsRow>;
  selectedIds: Set<string>;
  onToggleSelectAll: () => void;
  onToggleSelect: (id: string) => void;
  onViewMailContent: (content: string) => void;
  onViewDetails: (id: string) => void;
  onEdit?: (id: string) => void;
};

function truncateText(text: string, maxLength = 50) {
  if (!text) return "—";
  const stripped = text.replace(/<[^>]*>/g, "");
  return stripped.length > maxLength ? stripped.substring(0, maxLength) + "..." : stripped;
}

// Add: strip HTML and decode HTML entities for better mail snippets
function stripTagsAndDecode(input: string) {
  if (!input) return "";
  // Very lightweight entity decode to avoid DOM usage
  const decoded = input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // Strip tags
  return decoded.replace(/<[^>]*>/g, "");
}

// Add: extract last path segment helper for document name
function extractDocName(input?: string) {
  if (!input) return "—";
  const parts = input.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : input;
}

function StatusBadge({ value }: { value?: string }) {
  const s = (value || "—").toLowerCase();
  let cls = "bg-slate-100 text-slate-700 dark:bg-slate-80/60 dark:text-slate-300";
  if (s.includes("success") || s.includes("done") || s.includes("complete") || s.includes("processed")) {
    cls = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  } else if (s.includes("pending") || s.includes("queue") || s.includes("progress") || s.includes("processing")) {
    cls = "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
  } else if (s.includes("error") || s.includes("fail")) {
    cls = "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
  }
  return <Badge className={cls}>{value || "—"}</Badge>;
}

export function DocumentsTable({
  docs,
  selectedIds,
  onToggleSelectAll,
  onToggleSelect,
  onViewMailContent,
  onViewDetails,
  onEdit,
}: DocumentsTableProps): ReactNode {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"id" | "from" | "subject" | "status" | "doc" | "created" | "cc">("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [showCreatedAt, setShowCreatedAt] = useState(false);
  const [showCC, setShowCC] = useState(true);

  // Remove spinner delay to open immediately
  const [openingId, setOpeningId] = useState<string | null>(null);

  // Add: "Document Only" toggle state, persisted to localStorage
  const [docOnly, setDocOnly] = useState<boolean>(() => {
    try {
      return localStorage.getItem("openDocumentOnly") === "true";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("openDocumentOnly", String(docOnly));
    } catch {
      // ignore
    }
  }, [docOnly]);

  // ADD: Debounced search for smoother filtering under load
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  // ADD: Precompute derived fields to avoid repeated heavy work
  const derivedDocs = useMemo(() => {
    return docs.map((d) => {
      const docName =
        extractDocName(d.bucket_name) ||
        extractDocName(d.title || "") ||
        extractDocName(d.subject || "") ||
        d.id;
      const mailPlain = stripTagsAndDecode(d.mail_content || "");
      return { ...d, _docName: docName, _mailPlain: mailPlain };
    });
  }, [docs]);

  // Update: allow toggling sort for all keys
  const toggleSort = (key: "id" | "from" | "subject" | "status" | "doc" | "created" | "cc") => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  // Add: labels for sort UI
  const sortLabels: Record<typeof sortBy, string> = {
    id: "ID",
    from: "From",
    subject: "Subject",
    status: "Status",
    doc: "Document",
    created: "Created",
    cc: "CC Emails",
  };

  const processed = useMemo(() => {
    const filtered = deferredSearch.length
      ? derivedDocs.filter((d) => {
          const name = (d.subject || d.title || d.bucket_name || d.id || "").toLowerCase();
          const from = (d.from_email || "").toLowerCase();
          const status = (d.status || "").toLowerCase();
          const cc = (Array.isArray(d.cc_emails) ? d.cc_emails.join(",") : "").toLowerCase();
          const mail = (d._mailPlain || "").toLowerCase();
          const docName = (d._docName || "").toLowerCase();
          return (
            name.includes(deferredSearch) ||
            from.includes(deferredSearch) ||
            status.includes(deferredSearch) ||
            cc.includes(deferredSearch) ||
            mail.includes(deferredSearch) ||
            docName.includes(deferredSearch)
          );
        })
      : derivedDocs;

    const sorted = [...filtered].sort((a, b) => {
      // ID
      if (sortBy === "id") {
        const ai = Number(a.id);
        const bi = Number(b.id);
        const aNum = Number.isFinite(ai);
        const bNum = Number.isFinite(bi);
        if (aNum && bNum) {
          return sortDir === "asc" ? ai - bi : bi - ai;
        }
        const as = (a.id || "").toLowerCase();
        const bs = (b.id || "").toLowerCase();
        return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
      }
      // From Mail
      if (sortBy === "from") {
        const af = (a.from_email || "").toLowerCase();
        const bf = (b.from_email || "").toLowerCase();
        return sortDir === "asc" ? af.localeCompare(bf) : bf.localeCompare(af);
      }
      // Subject
      if (sortBy === "subject") {
        const asub = ((a.subject || "").replace(/<[^>]*>/g, "")).toLowerCase();
        const bsub = ((b.subject || "").replace(/<[^>]*>/g, "")).toLowerCase();
        return sortDir === "asc" ? asub.localeCompare(bsub) : bsub.localeCompare(asub);
      }
      // Document (last path segment / derived)
      if (sortBy === "doc") {
        const an = (a._docName || a.id || "").toLowerCase();
        const bn = (b._docName || b.id || "").toLowerCase();
        return sortDir === "asc" ? an.localeCompare(bn) : bn.localeCompare(an);
      }
      // Status
      if (sortBy === "status") {
        const as = (a.status || "").toLowerCase();
        const bs = (b.status || "").toLowerCase();
        return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
      }
      // Created At
      if (sortBy === "created") {
        const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
        return sortDir === "asc" ? ad - bd : bd - ad;
      }
      // CC Emails (join to a single string)
      if (sortBy === "cc") {
        const ac = (Array.isArray(a.cc_emails) ? a.cc_emails.join(", ") : "").toLowerCase();
        const bc = (Array.isArray(b.cc_emails) ? b.cc_emails.join(", ") : "").toLowerCase();
        return sortDir === "asc" ? ac.localeCompare(bc) : bc.localeCompare(ac);
      }
      return 0;
    });

    return sorted;
  }, [derivedDocs, deferredSearch, sortBy, sortDir]);

  const total = processed.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const visible = processed.slice(start, end);

  // Open immediately (no spinner state)
  const handleOpen = (id: string) => {
    try {
      localStorage.setItem("openDocumentOnly", String(docOnly));
    } catch {
      // ignore
    }
    setOpeningId(null);
    onViewDetails(id);
  };

  const SortIcon = ({ active, dir }: { active: boolean; dir: "asc" | "desc" }) =>
    active ? (dir === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />) : <ArrowUpDown className="h-4 w-4" />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, filter: "blur(1px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="rounded-2xl border border-white/10 bg-white/[0.04] supports-[backdrop-filter]:bg-white/10 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-hidden ring-1 ring-white/5"
    >
      {/* Search + controls */}
      <div className="p-3 border-b border-white/10 bg-white/[0.06] supports-[backdrop-filter]:bg-white/10 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search documents..."
            className="bg-background/50 h-9"
            aria-label="Search documents"
          />
          {/* Document Only toggle */}
          <div className="flex items-center gap-2 pl-1">
            <Switch
              checked={docOnly}
              onCheckedChange={(v) => setDocOnly(!!v)}
              aria-label="Open documents without SAP"
            />
            <span className="text-xs text-muted-foreground">Document Only</span>
          </div>

          {/* Columns menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto bg-white/5 hover:bg-white/10 border-white/10 backdrop-blur"
                aria-label="Configure columns"
                title="Columns"
              >
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuCheckboxItem
                checked={showCreatedAt}
                onCheckedChange={(v) => setShowCreatedAt(!!v)}
              >
                Created At
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={showCC}
                onCheckedChange={(v) => setShowCC(!!v)}
              >
                CC Emails
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="bg-white/5 hover:bg-white/10 border-white/10 backdrop-blur"
                aria-label="Sort"
                title="Sort"
              >
                <ArrowUpDown className="h-4 w-4 mr-2" />
                Sort: {sortLabels[sortBy]} ({sortDir})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuLabel>Field</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => toggleSort("id")}>ID</DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleSort("from")}>From</DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleSort("subject")}>Subject</DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleSort("status")}>Status</DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleSort("doc")}>Document</DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleSort("created")}>Created</DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleSort("cc")}>CC Emails</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Direction</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setSortDir("asc")}>Ascending</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortDir("desc")}>Descending</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Select all */}
          <div className="hidden md:flex items-center gap-2 pl-2">
            <Checkbox
              checked={selectedIds.size === docs.length && docs.length > 0}
              onCheckedChange={onToggleSelectAll}
              aria-label="Select all documents"
            />
            <span className="text-xs text-muted-foreground">Select all</span>
          </div>
        </div>
      </div>

      {/* Scrollable rows area */}
      <div className="max-h-[60vh] overflow-auto relative">
        {/* Desktop compact card list */}
        <div className="hidden md:block p-3 space-y-2.5">
          {visible.map((doc) => {
            const docName =
              extractDocName(doc.bucket_name) ||
              extractDocName(doc.title || "") ||
              extractDocName(doc.subject || "") ||
              doc.id;
            const subject = truncateText(doc.subject || "—", 110);
            const ccDisplay =
              Array.isArray(doc.cc_emails) && doc.cc_emails.length
                ? doc.cc_emails.join(", ")
                : "—";
            // Use robust decoding for mail snippet
            const mailSnippet = truncateText(stripTagsAndDecode(doc.mail_content || "—"), 180);

            return (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                whileTap={{ scale: 0.997 }}
                onClick={() => handleOpen(doc.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleOpen(doc.id);
                  }
                }}
                className={`group rounded-2xl border border-white/10 ${
                  selectedIds.has(doc.id)
                    ? "bg-white/[0.14] ring-1 ring-white/20"
                    : "bg-white/[0.06]"
                } supports-[backdrop-filter]:bg-white/10 backdrop-blur px-4 py-2 shadow-sm cursor-pointer`}
              >
                {/* Top row: checkbox, ID first, title, status */}
                <div className="flex items-start gap-3">
                  <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(doc.id)}
                      onCheckedChange={() => onToggleSelect(doc.id)}
                      aria-label={`Select ${doc.id}`}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono truncate" title={doc.id}>
                          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{doc.id}</span>
                          <span className="text-foreground/70">•</span>
                          <span className="text-sm font-semibold truncate" title={docName}>
                            {docName}
                          </span>
                        </div>
                        <div className="mt-0.5 text-sm text-muted-foreground truncate" title={subject}>
                          {subject}
                        </div>
                      </div>

                      <div className="shrink-0">
                        <StatusBadge value={doc.status} />
                      </div>
                    </div>

                    {/* Meta rows (compact) */}
                    <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">From</span>
                        <span className="text-xs truncate" title={doc.from_email || "—"}>
                          {doc.from_email || "—"}
                        </span>
                      </div>

                      {showCreatedAt && (
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Created</span>
                          <span className="text-xs truncate" title={doc.created_at || "—"}>
                            {doc.created_at || "—"}
                          </span>
                        </div>
                      )}

                      {showCC && (
                        <div className="flex items-center gap-2 min-w-0 sm:col-span-2">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">CC</span>
                          <span className="text-xs truncate" title={ccDisplay}>
                            {ccDisplay}
                          </span>
                        </div>
                      )}

                      <div
                        className="flex items-start gap-2 min-w-0 sm:col-span-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewMailContent(doc.mail_content || "");
                        }}
                        role="button"
                        title="Click to view full mail content"
                      >
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
                          Mail
                        </span>
                        <span className="text-xs text-muted-foreground truncate max-w-full">
                          {mailSnippet}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Mobile card list (smaller paddings) */}
        <div className="md:hidden p-3 space-y-2.5">
          {visible.map((doc) => {
            const docName =
              extractDocName(doc.bucket_name) ||
              extractDocName(doc.title || "") ||
              extractDocName(doc.subject || "") ||
              doc.id;
            const ccDisplay = Array.isArray(doc.cc_emails) && doc.cc_emails.length
              ? doc.cc_emails.join(", ")
              : "—";
            const mailSnippet = truncateText(stripTagsAndDecode(doc.mail_content || "—"), 140);

            return (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="rounded-xl border border-white/10 bg-white/[0.06] supports-[backdrop-filter]:bg-white/10 backdrop-blur p-2 shadow-sm cursor-pointer"
                onClick={() => handleOpen(doc.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleOpen(doc.id);
                  }
                }}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedIds.has(doc.id)}
                    onCheckedChange={() => onToggleSelect(doc.id)}
                    aria-label={`Select ${doc.id}`}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium truncate" title={docName}>
                        {docName}
                      </div>
                      <div className="text-xs">
                        <StatusBadge value={doc.status} />
                      </div>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground font-mono truncate" title={doc.id}>
                      ID: {doc.id}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground truncate" title={doc.from_email || "—"}>
                      From: {doc.from_email || "—"}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground truncate" title={doc.subject || "—"}>
                      Subject: {truncateText(doc.subject || "—", 80)}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground truncate" title={ccDisplay}>
                      CC: {ccDisplay}
                    </div>
                    <div
                      className="mt-0.5 text-xs text-muted-foreground truncate"
                      title={mailSnippet}
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewMailContent(doc.mail_content || "");
                      }}
                      role="button"
                    >
                      Mail: {mailSnippet}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between p-3 border-t border-white/10 bg-white/[0.06] supports-[backdrop-filter]:bg-white/10 backdrop-blur">
        <div className="text-xs text-muted-foreground">
          Showing {start + 1}-{end} of {total}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="bg-white/5 hover:bg-white/10 border-white/10"
          >
            Prev
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="bg-white/5 hover:bg-white/10 border-white/10"
          >
            Next
          </Button>
        </div>
      </div>
    </motion.div>
  );
}