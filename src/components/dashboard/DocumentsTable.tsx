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
} from "@/components/ui/dropdown-menu";
import { ReactNode, useMemo, useState } from "react";
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
  const [showCC, setShowCC] = useState(false);

  // Add: opening state to show instant feedback when navigating
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

  const processed = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term.length
      ? docs.filter((d) => {
          const name = (d.subject || d.title || d.bucket_name || d.id || "").toLowerCase();
          const from = (d.from_email || "").toLowerCase();
          const status = (d.status || "").toLowerCase();
          return name.includes(term) || from.includes(term) || status.includes(term);
        })
      : docs;

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
      // Document (last path segment)
      if (sortBy === "doc") {
        const an = (extractDocName(a.bucket_name) || extractDocName(a.title || "") || extractDocName(a.subject || "") || a.id || "").toLowerCase();
        const bn = (extractDocName(b.bucket_name) || extractDocName(b.title || "") || extractDocName(b.subject || "") || b.id || "").toLowerCase();
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
  }, [docs, search, sortBy, sortDir]);

  const total = processed.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const visible = processed;

  // Add: central open handler with quick visual feedback
  const handleOpen = (id: string) => {
    // Persist preference just before navigating, for reliability
    try {
      localStorage.setItem("openDocumentOnly", String(docOnly));
    } catch {
      // ignore
    }
    setOpeningId(id);
    onViewDetails(id);
    setTimeout(() => setOpeningId((curr) => (curr === id ? null : curr)), 3000);
  };

  const SortIcon = ({ active, dir }: { active: boolean; dir: "asc" | "desc" }) =>
    active ? (dir === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />) : <ArrowUpDown className="h-4 w-4" />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, filter: "blur(2px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-2xl border border-white/10 bg-white/[0.04] supports-[backdrop-filter]:bg-white/10 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-hidden ring-1 ring-white/5"
    >
      {/* Search + controls */}
      <div className="p-4 border-b border-white/10 bg-white/[0.06] supports-[backdrop-filter]:bg-white/10 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search documents..."
            className="bg-background/50"
            aria-label="Search documents"
          />
          {/* Add: Document Only toggle (move from detail page into documents) */}
          <div className="flex items-center gap-2 pl-2">
            <Switch
              checked={docOnly}
              onCheckedChange={(v) => setDocOnly(!!v)}
              aria-label="Open documents without SAP"
            />
            <span className="text-xs text-muted-foreground">Document Only</span>
          </div>
          {/* Add: Columns menu */}
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
        </div>
      </div>

      {/* Scrollable rows area */}
      <div className="max-h-[60vh] overflow-auto relative">
        {/* Desktop table */}
        <div className="hidden md:block">
          <Table className="text-sm md:text-[0.95rem] table-auto">
            <TableHeader className="sticky top-0 z-10 bg-white/[0.06] supports-[backdrop-filter]:bg-white/10 backdrop-blur-xl border-b border-white/10 shadow-inner">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedIds.size === docs.length && docs.length > 0}
                    onCheckedChange={onToggleSelectAll}
                    aria-label="Select all documents"
                  />
                </TableHead>
                {/* Make ID sortable with narrower width */}
                <TableHead
                  className="w-[120px] cursor-pointer select-none"
                  onClick={() => toggleSort("id")}
                >
                  <div className="flex items-center gap-2">
                    ID
                    <SortIcon active={sortBy === "id"} dir={sortDir} />
                  </div>
                </TableHead>
                {/* From Mail sortable - narrower */}
                <TableHead
                  className="w-[180px] cursor-pointer select-none"
                  onClick={() => toggleSort("from")}
                >
                  <div className="flex items-center gap-2">
                    From Mail
                    <SortIcon active={sortBy === "from"} dir={sortDir} />
                  </div>
                </TableHead>
                {/* Subject sortable - narrower min */}
                <TableHead
                  className="min-w-[180px] cursor-pointer select-none"
                  onClick={() => toggleSort("subject")}
                >
                  <div className="flex items-center gap-2">
                    Subject
                    <SortIcon active={sortBy === "subject"} dir={sortDir} />
                  </div>
                </TableHead>
                {/* Document sortable - narrower min */}
                <TableHead
                  className="min-w-[180px] cursor-pointer select-none"
                  onClick={() => toggleSort("doc")}
                >
                  <div className="flex items-center gap-2">
                    Document
                    <SortIcon active={sortBy === "doc"} dir={sortDir} />
                  </div>
                </TableHead>
                {/* Status sortable - narrower */}
                <TableHead
                  className="w-[120px] cursor-pointer select-none"
                  onClick={() => toggleSort("status")}
                >
                  <div className="flex items-center gap-2">
                    Status
                    <SortIcon active={sortBy === "status"} dir={sortDir} />
                  </div>
                </TableHead>
                {/* Optional: Created At and CC keep existing code */}
                {/* Actions: widen slightly to fit Edit + Open */}
                <TableHead className="w-28">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-white/10">
              {visible.map((doc, idx) => {
                const docName =
                  extractDocName(doc.bucket_name) ||
                  extractDocName(doc.title || "") ||
                  extractDocName(doc.subject || "") ||
                  doc.id;
                const subject = truncateText(doc.subject || "—", 80);
                return (
                  <MotionTableRow
                    key={doc.id}
                    className={`${
                      selectedIds.has(doc.id)
                        ? "bg-white/[0.12] ring-1 ring-white/20 shadow-inner"
                        : "odd:bg-white/[0.02] even:bg-white/[0.04]"
                    } hover:bg-white/[0.08] transition-colors border-b border-white/10 backdrop-blur-xl group cursor-pointer`}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: "easeOut", delay: Math.min(idx * 0.03, 0.4) }}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.995 }}
                    layout
                    // Make the entire row navigable
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
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(doc.id)}
                        onCheckedChange={() => onToggleSelect(doc.id)}
                        aria-label={`Select document ${doc.id}`}
                      />
                    </TableCell>
                    {/* ID */}
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {truncateText(doc.id, 24)}
                    </TableCell>
                    {/* From Mail - narrower */}
                    <TableCell className="truncate max-w-[180px]" title={doc.from_email || "—"}>
                      {doc.from_email || "—"}
                    </TableCell>
                    {/* Subject - narrower */}
                    <TableCell className="truncate max-w-[220px]" title={doc.subject || "—"}>
                      {subject}
                    </TableCell>
                    {/* Document - narrower */}
                    <TableCell className="truncate max-w-[220px]" title={docName}>
                      {docName}
                    </TableCell>
                    {/* Status */}
                    <TableCell>
                      <StatusBadge value={doc.status} />
                    </TableCell>
                    {/* Optional Created/CC keep existing code */}
                    {/* Actions: show Edit always + Open */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-white/5 hover:bg-white/10 border-white/10 backdrop-blur transition-transform active:scale-95"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onEdit) onEdit(doc.id);
                            else onViewDetails(doc.id);
                          }}
                          aria-label="Edit document"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-white/5 hover:bg-white/10 border-white/10 backdrop-blur transition-transform active:scale-95"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpen(doc.id);
                          }}
                          aria-label="Open details"
                          title="Open"
                          disabled={openingId === doc.id}
                          aria-busy={openingId === doc.id}
                        >
                          {openingId === doc.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </MotionTableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden p-3 space-y-3">
          {visible.map((doc, idx) => {
            const docName =
              extractDocName(doc.bucket_name) ||
              extractDocName(doc.title || "") ||
              extractDocName(doc.subject || "") ||
              doc.id;
            return (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: "easeOut", delay: Math.min(idx * 0.03, 0.3) }}
                whileHover={{ y: -2 }}
                className="rounded-xl border border-white/10 bg-white/[0.06] supports-[backdrop-filter]:bg-white/10 backdrop-blur p-3 shadow-sm cursor-pointer"
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
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-white/5 hover:bg-white/10 border-white/10 backdrop-blur transition-transform active:scale-95"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onEdit) onEdit(doc.id);
                            else onViewDetails(doc.id);
                          }}
                          aria-label="Edit document"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-white/5 hover:bg-white/10 border-white/10 backdrop-blur transition-transform active:scale-95"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpen(doc.id);
                          }}
                          aria-label="Open details"
                          title="Open"
                          disabled={openingId === doc.id}
                          aria-busy={openingId === doc.id}
                        >
                          {openingId === doc.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground font-mono truncate" title={doc.id}>
                      ID: {doc.id}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground truncate" title={doc.from_email || "—"}>
                      From: {doc.from_email || "—"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground truncate" title={doc.subject || "—"}>
                      Subject: {truncateText(doc.subject || "—", 80)}
                    </div>
                    {/* Add: Status (mobile) */}
                    <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
                      <span>Status:</span>
                      <StatusBadge value={doc.status} />
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Pagination */}
      <div className="hidden" />
    </motion.div>
  );
}