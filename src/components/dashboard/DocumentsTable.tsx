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
import { ReactNode } from "react";

const MotionTableRow = motion(TableRow);

type DocsRow = {
  id: string;
  from_email?: string;
  cc_emails?: string[];
  subject?: string;
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
};

function truncateText(text: string, maxLength = 50) {
  if (!text) return "—";
  const stripped = text.replace(/<[^>]*>/g, "");
  return stripped.length > maxLength ? stripped.substring(0, maxLength) + "..." : stripped;
}

export function DocumentsTable({
  docs,
  selectedIds,
  onToggleSelectAll,
  onToggleSelect,
  onViewMailContent,
  onViewDetails,
}: DocumentsTableProps): ReactNode {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, filter: "blur(2px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-2xl border border-white/10 bg-white/[0.04] supports-[backdrop-filter]:bg-white/10 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-hidden ring-1 ring-white/5"
    >
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
            <TableHead className="w-24">ID</TableHead>
            <TableHead className="min-w-[180px]">From</TableHead>
            <TableHead className="min-w-[180px]">CC</TableHead>
            <TableHead className="min-w-[200px]">Subject</TableHead>
            <TableHead className="min-w-[150px]">PDF Name</TableHead>
            <TableHead className="min-w-[200px]">Mail Content</TableHead>
            <TableHead className="w-32">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {docs.map((doc, idx) => (
            <MotionTableRow
              key={doc.id}
              className={`${
                selectedIds.has(doc.id)
                  ? "bg-white/[0.12] ring-1 ring-white/20 shadow-inner"
                  : "bg-white/[0.04]"
              } h-14 hover:bg-white/[0.08] transition-colors border-b border-white/10 backdrop-blur-xl`}
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
              <TableCell className="font-mono text-xs">{doc.id}</TableCell>
              <TableCell>
                <div className="max-w-[180px] truncate" title={doc.from_email || "—"}>
                  {doc.from_email || "—"}
                </div>
              </TableCell>
              <TableCell>
                {doc.cc_emails && doc.cc_emails.length > 0 ? (
                  <div className="text-xs max-w-[180px]">
                    <div className="truncate" title={doc.cc_emails.join(", ")}>
                      {doc.cc_emails.slice(0, 2).join(", ")}
                    </div>
                    {doc.cc_emails.length > 2 && (
                      <span className="text-muted-foreground">+{doc.cc_emails.length - 2} more</span>
                    )}
                  </div>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>
                <div className="max-w-[200px] truncate" title={doc.subject || "—"}>
                  {doc.subject || "—"}
                </div>
              </TableCell>
              <TableCell>
                <div className="max-w-[150px] truncate" title={doc.bucket_name || "—"}>
                  {doc.bucket_name || "—"}
                </div>
              </TableCell>
              <TableCell>
                {doc.mail_content ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground max-w-[150px] truncate">
                      {truncateText(doc.mail_content, 30)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white/5 hover:bg-white/10 border-white/10 backdrop-blur"
                      onClick={() => onViewMailContent(doc.mail_content!)}
                    >
                      <Mail className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white/5 hover:bg-white/10 border-white/10 backdrop-blur text-foreground"
                  onClick={() => onViewDetails(doc.id)}
                >
                  View Details
                </Button>
              </TableCell>
            </MotionTableRow>
          ))}
        </TableBody>
      </Table>
    </motion.div>
  );
}