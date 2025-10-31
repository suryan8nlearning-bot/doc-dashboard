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
import { ChevronDown, ChevronUp, ArrowUpDown, Eye, Pencil } from "lucide-react";
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

function StatusBadge({ value }: { value?: string }) {
  const s = (value || "—").toLowerCase();
  let cls = "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300";
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
  const [sortBy, setSortBy] = useState<"name" | "date" | "status">("date");
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
              <TableHead className="min-w-[220px] cursor-pointer select-none" onClick={() => toggleSort("name")}>
                <div className="flex items-center gap-2">
                  Name
                  <SortIcon active={sortBy === "name"} dir={sortDir} />
                </div>
              </TableHead>
              <TableHead className="w-[160px] cursor-pointer select-none" onClick={() => toggleSort("date")}>
                <div className="flex items-center gap-2">
                  Date
                  <SortIcon active={sortBy === "date"} dir={sortDir} />
                </div>
              </TableHead>
              <TableHead className="w-[140px] cursor-pointer select-none" onClick={() => toggleSort("status")}>
                <div className="flex items-center gap-2">
                  Status
                  <SortIcon active={sortBy === "status"} dir={sortDir} />
                </div>
              </TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-white/10">
            {visible.map((doc, idx) => {
              const name = doc.subject || doc.title || doc.bucket_name || doc.id;
              const dateStr = doc.created_at ? new Date(doc.created_at).toLocaleString() : "—";
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
                  <TableCell>
                    <div className="flex flex-col">
                      <div className="font-medium truncate max-w-[360px]" title={name}>
                        {name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate max-w-[360px]" title={doc.from_email || "—"}>
                        {doc.from_email || "—"}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{dateStr}</TableCell>
                  <TableCell>
                    <StatusBadge value={doc.status} />
                  </TableCell>
                  <TableCell className="space-x-1">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-white/5 hover:bg-white/10 border-white/10 backdrop-blur"
                        onClick={() => onViewDetails(doc.id)}
                        aria-label="View details"
                        title="View"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-white/5 hover:bg-white/10 border-white/10 backdrop-blur"
                        onClick={() => onEdit?.(doc.id)}
                        aria-label="Edit document"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {doc.mail_content && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-white/5 hover:bg-white/10 border-white/10 backdrop-blur"
                          onClick={() => onViewMailContent(doc.mail_content!)}
                          aria-label="View email"
                          title="Mail"
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                      )}
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
          const name = doc.subject || doc.title || doc.bucket_name || doc.id;
          const dateStr = doc.created_at ? new Date(doc.created_at).toLocaleString() : "—";
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
                <Checkbox checked={selectedIds.has(doc.id)} onCheckedChange={() => onToggleSelect(doc.id)} aria-label={`Select ${doc.id}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium truncate" title={name}>
                      {name}
                    </div>
                    <StatusBadge value={doc.status} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{dateStr}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white/5 hover:bg-white/10 border-white/10 backdrop-blur"
                      onClick={() => onViewDetails(doc.id)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white/5 hover:bg-white/10 border-white/10 backdrop-blur"
                      onClick={() => onEdit?.(doc.id)}
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    {doc.mail_content && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-white/5 hover:bg-white/10 border-white/10 backdrop-blur"
                        onClick={() => onViewMailContent(doc.mail_content!)}
                      >
                        <Mail className="h-4 w-4 mr-1" />
                        Mail
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
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