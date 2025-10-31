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
import { ChevronDown, ChevronUp, ArrowUpDown, ChevronRight } from "lucide-react";
import { ReactNode, useMemo, useState } from "react";

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
  // Change default sorting to name since we're not showing date/status columns
  const [sortBy, setSortBy] = useState<"name" | "date" | "status">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const toggleSort = (key: "name" | "date" | "status") => {
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
      if (sortBy === "name") {
        const an = (a.subject || a.title || a.bucket_name || a.id || "").toLowerCase();
        const bn = (b.subject || b.title || b.bucket_name || b.id || "").toLowerCase();
        return sortDir === "asc" ? an.localeCompare(bn) : bn.localeCompare(an);
      }
      if (sortBy === "status") {
        const as = (a.status || "").toLowerCase();
        const bs = (b.status || "").toLowerCase();
        return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
      }
      // date
      const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
      return sortDir === "asc" ? ad - bd : bd - ad;
    });

    return sorted;
  }, [docs, search, sortBy, sortDir]);

  const total = processed.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const visible = processed.slice(start, end);

  const SortIcon = ({ active, dir }: { active: boolean; dir: "asc" | "desc" }) =>
    active ? (dir === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />) : <ArrowUpDown className="h-4 w-4" />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, filter: "blur(2px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-2xl border border-white/10 bg-white/[0.04] supports-[backdrop-filter]:bg-white/10 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-hidden ring-1 ring-white/5"
    >
      {/* Search bar */}
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
          <div className="text-xs text-muted-foreground">{total} results</div>
        </div>
      </div>

      {/* Scrollable rows area */}
      <div className="max-h-[60vh] overflow-auto relative">
        {/* Desktop table */}
        <div className="hidden md:block">
          <Table className="text-sm md:text-[0.95rem]">
            <TableHeader className="sticky top-0 z-10 bg-white/[0.06] supports-[backdrop-filter]:bg-white/10 backdrop-blur-xl border-b border-white/10 shadow-inner">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedIds.size === docs.length && docs.length > 0}
                    onCheckedChange={onToggleSelectAll}
                    aria-label="Select all documents"
                  />
                </TableHead>
                <TableHead className="w-[160px]">ID</TableHead>
                <TableHead className="w-[220px]">From Mail</TableHead>
                <TableHead className="min-w-[220px]">Subject</TableHead>
                <TableHead
                  className="w-[140px] cursor-pointer select-none"
                  onClick={() => toggleSort("status")}
                >
                  <div className="flex items-center gap-2">
                    Status
                    <SortIcon active={sortBy === "status"} dir={sortDir} />
                  </div>
                </TableHead>
                <TableHead
                  className="min-w-[220px] cursor-pointer select-none"
                  onClick={() => toggleSort("name")}
                >
                  <div className="flex items-center gap-2">
                    Document
                    <SortIcon active={sortBy === "name"} dir={sortDir} />
                  </div>
                </TableHead>
                <TableHead className="w-24">Actions</TableHead>
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
                    } hover:bg-white/[0.08] transition-colors border-b border-white/10 backdrop-blur-xl group`}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: "easeOut", delay: Math.min(idx * 0.03, 0.4) }}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.995 }}
                    layout
                  >
                    <TableCell>
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
                    {/* From Mail */}
                    <TableCell className="truncate max-w-[220px]" title={doc.from_email || "—"}>
                      {doc.from_email || "—"}
                    </TableCell>
                    {/* Subject */}
                    <TableCell className="truncate" title={doc.subject || "—"}>
                      {subject}
                    </TableCell>
                    {/* Add: Status cell */}
                    <TableCell>
                      <StatusBadge value={doc.status} />
                    </TableCell>
                    {/* Document (last segment) */}
                    <TableCell className="truncate" title={docName}>
                      {docName}
                    </TableCell>
                    {/* Actions: only display chevron (open) */}
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-white/5 hover:bg-white/10 border-white/10 backdrop-blur"
                        onClick={() => onViewDetails(doc.id)}
                        aria-label="Open details"
                        title="Open"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
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
                className={`rounded-xl border border-white/10 bg-white/[0.06] supports-[backdrop-filter]:bg-white/10 backdrop-blur p-3 shadow-sm`}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedIds.has(doc.id)}
                    onCheckedChange={() => onToggleSelect(doc.id)}
                    aria-label={`Select ${doc.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium truncate" title={docName}>
                        {docName}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-white/5 hover:bg-white/10 border-white/10 backdrop-blur"
                        onClick={() => onViewDetails(doc.id)}
                        aria-label="Open details"
                        title="Open"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
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
      <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 bg-white/[0.04] supports-[backdrop-filter]:bg-white/10 backdrop-blur">
        <div className="text-xs text-muted-foreground">
          Showing {total === 0 ? 0 : start + 1}-{end} of {total}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="bg-white/5 hover:bg-white/10 border-white/10 backdrop-blur"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
          >
            Prev
          </Button>
          <div className="text-xs tabular-nums">
            {currentPage} / {totalPages}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="bg-white/5 hover:bg-white/10 border-white/10 backdrop-blur"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </motion.div>
  );
}