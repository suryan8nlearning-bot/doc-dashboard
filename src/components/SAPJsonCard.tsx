import { useEffect, useMemo, useState } from "react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Copy, Download, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import * as SalesSchema from "@/schemas/salesOrderCreate";
import { motion } from "framer-motion";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import type { DocumentData, BoundingBox } from "@/lib/supabase";
import { createSapToSourceMapping, type SapToSourceMapping } from "@/lib/mapping";

type SAPJsonCardProps = {
  data: unknown;
  title?: string;
  className?: string;
  defaultCollapsed?: boolean;
  // Add: optional hover highlight + source doc for mapping
  onHoverHighlight?: (box: (BoundingBox & { page?: number; color?: string }) | null) => void;
  sourceDocumentData?: DocumentData;
};

// Add: robust JSON extraction helpers to handle string inputs containing JSON
function extractJsonFromText(input: string): any | null {
  const s = input.trim();

  // 1) Try fenced blocks 
  const fenced = s.match(/(?:^|[^\\])\{\{(.+?)\}\}/s);
  if (fenced) return JSON.parse(fenced[1]);

  // 2) Try JSON string
  try {
    return JSON.parse(s);
  } catch {
    // 3) Try JSON string with escaped quotes
    try {
      return JSON.parse(s.replace(/"/g, '"'));
    } catch {
      return null;
    }
  }
}

export function SAPJsonCard({
  data,
  // Rename the default title
  title = "SAP Data",
  className,
  // Load collapsed by default
  defaultCollapsed = true,
  // Ensure these props are available for hover + mapping
  onHoverHighlight,
  sourceDocumentData,
}: SAPJsonCardProps) {
  const [collapsed, setCollapsed] = useState<boolean>(defaultCollapsed);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set<string>());

  // Add: build mapping from SAP leaf paths -> source bounding boxes
  const hoverMapping: SapToSourceMapping | null = useMemo(() => {
    try {
      return sourceDocumentData ? createSapToSourceMapping(data, sourceDocumentData) : null;
    } catch {
      return null;
    }
  }, [data, sourceDocumentData]);

  // Insert: derive order tree from backend schema and reordering helpers
  const deriveOrderTreeFromSchema = (schemaMod: any): any => {
    // Try common named exports first (include our actual export name)
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

      // Handle JSON Schema (object/array) explicitly
      if (typeof node === "object") {
        // Object schema: { type: "object", properties: {...} }
        if (node.type === "object" && node.properties && typeof node.properties === "object") {
          const out: Record<string, any> = {};
          for (const k of Object.keys(node.properties)) {
            out[k] = visit(node.properties[k]);
          }
          return out;
        }
        // Array schema: { type: "array", items: {...} }
        if (node.type === "array" && node.items) {
          return [visit(node.items)];
        }
      }

      // Heuristic for Zod: node._def.shape or node._def.shape()
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

      // If plain object, use its keys order
      if (typeof node === "object" && !Array.isArray(node)) {
        const out: Record<string, any> = {};
        for (const k of Object.keys(node)) out[k] = visit((node as any)[k]);
        return out;
      }

      // If array, use first element as schema for items
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

      // Place keys that exist in the provided order first
      for (const k of orderKeys) {
        if (k in (value as any)) {
          ordered[k] = reorderByOrderTree((value as any)[k], (orderTree ?? {})[k]);
          seen.add(k);
        }
      }

      // Append any extra keys that aren't in the schema order
      for (const k of Object.keys(value as any)) {
        if (!seen.has(k)) {
          ordered[k] = reorderByOrderTree((value as any)[k], undefined);
        }
      }

      return ordered;
    }

    return value;
  };

  const orderTree = useMemo(() => deriveOrderTreeFromSchema(SalesSchema), []);

  const pretty = useMemo(() => {
    try {
      if (typeof data === "string") {
        if (!data.trim()) return "// Empty";
        const parsedLocal = JSON.parse(data);
        const maybeOrdered = orderTree ? reorderByOrderTree(parsedLocal, orderTree) : parsedLocal;
        return JSON.stringify(maybeOrdered, null, 2);
      }
      if (data == null) return "// No data";
      if (typeof data === "object") {
        const maybeOrdered = orderTree ? reorderByOrderTree(data as any, orderTree) : data;
        return JSON.stringify(maybeOrdered, null, 2);
      }
      return JSON.stringify(data, null, 2);
    } catch {
      // Not JSON-parsable string; show as-is
      return String(data);
    }
  }, [data, orderTree]);

  const parsed = useMemo(() => {
    try {
      if (typeof data === "string") return JSON.parse(data);
      if (data == null) return null;
      return data as any;
    } catch {
      return null;
    }
  }, [data]);

  // Insert: derive a schema-ordered object for the tree view
  const ordered = useMemo(() => {
    if (!parsed || typeof parsed !== "object") return parsed;
    try {
      return orderTree ? reorderByOrderTree(parsed, orderTree) : parsed;
    } catch {
      return parsed;
    }
  }, [parsed, orderTree]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pretty);
      toast.success("SAP JSON copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleDownload = () => {
    try {
      const blob = new Blob([pretty], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sap_payload.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Downloaded sap_payload.json");
    } catch {
      toast.error("Failed to download");
    }
  };

  const togglePath = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const isObjectLike = (v: unknown) => v !== null && typeof v === "object";
  const isArr = (v: unknown): v is Array<any> => Array.isArray(v);

  // Add: stable section colors + fallback palette for unknown keys
  const SAP_SECTION_COLORS: Record<string, string> = {
    metadata: "#10b981",
    header: "#10b981",
    vendor: "#8b5cf6",
    partner: "#8b5cf6",
    parties: "#8b5cf6",
    customer: "#f59e0b",
    items: "#0ea5e9",
    lines: "#0ea5e9",
    addresses: "#06b6d4",
    totals: "#f43f5e",
  };
  const FALLBACK_COLORS: Array<string> = [
    "#22c55e",
    "#8b5cf6",
    "#f59e0b",
    "#0ea5e9",
    "#f43f5e",
    "#06b6d4",
    "#a3e635",
    "#e879f9",
  ];
  function hashKeyToIndex(key: string): number {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
    return Math.abs(h) % FALLBACK_COLORS.length;
  }
  function colorForKey(key: string): string {
    return SAP_SECTION_COLORS[key] ?? FALLBACK_COLORS[hashKeyToIndex(key)];
  }

  const TreeNode = ({
    label,
    value,
    path,
    depth,
  }: {
    label: string;
    value: any;
    path: string;
    depth: number;
  }) => {
    const isComplex = isObjectLike(value);
    const indentStyle = { paddingLeft: `${depth * 16}px` };

    // For arrays, detect "array of objects" to render as a table (old items UI)
    const isArrayOfObjects =
      Array.isArray(value) &&
      (value as any[]).length > 0 &&
      (value as any[]).every((row) => row && typeof row === "object" && !Array.isArray(row));

    const tableColumns: Array<string> = isArrayOfObjects
      ? Object.keys((value as Array<Record<string, any>>)[0] ?? {})
      : [];

    if (!isComplex) {
      // Render leaf as simple editable field: label on left, value on right (editable for all types)
      return (
        <div
          className="py-2.5 px-3 rounded-md"
          style={indentStyle}
          // Add: hover highlight behavior using mapping
          onMouseEnter={() => {
            if (onHoverHighlight && hoverMapping) {
              const box = hoverMapping[path] || null;
              onHoverHighlight(box as any);
            }
          }}
          onMouseLeave={() => onHoverHighlight?.(null)}
        >
          <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-3 items-center">
            <label className="text-xs font-medium text-muted-foreground">{label}</label>
            {typeof value === "boolean" ? (
              <input type="checkbox" defaultChecked={value} className="h-4 w-4" />
            ) : (
              <input
                type={typeof value === "number" ? "number" : "text"}
                defaultValue={value === null || value === undefined ? "" : String(value)}
                className="w-full rounded-md border bg-background px-2 py-1 text-sm"
              />
            )}
          </div>
        </div>
      );
    }

    const entries = isArr(value)
      ? (value as any[]).map((v, i) => [`[${i}]`, v] as const)
      : Object.entries(value as Record<string, any>);

    const open = expanded.has(path);

    // Determine when immediate children are all leaves to layout as a responsive 3-column grid
    const allImmediateLeaves = entries.every(([_, v]) => !isObjectLike(v));

    return (
      <Accordion
        type="single"
        collapsible
        value={open ? path : ""}
        onValueChange={(val) =>
          setExpanded((prev) => {
            const next = new Set(prev);
            if (val) next.add(path);
            else next.delete(path);
            return next;
          })
        }
      >
        <AccordionItem value={path} className="border-none">
          <AccordionTrigger
            className="w-full flex items-center justify-between py-2.5 px-3 hover:bg-muted/50 transition-colors rounded-lg group"
            style={indentStyle}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                {label}
              </span>
            </div>
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            )}
          </AccordionTrigger>
          <AccordionContent className="mt-0.5 pl-0">
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={
                allImmediateLeaves
                  ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1"
                  : "space-y-1 pt-1"
              }
            >
              {isArrayOfObjects ? (
                <div className="p-1">
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        {tableColumns.map((col) => (
                          <TableHead
                            key={col}
                            className="text-xs font-medium text-muted-foreground whitespace-normal break-words"
                          >
                            {col}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(value as Array<Record<string, any>>).map((row, idx) => {
                        const mainRow = (
                          <TableRow key={`${path}-row-${idx}`}>
                            {tableColumns.map((col) => {
                              const cell = row?.[col];
                              const t = typeof cell;
                              const isObjCell =
                                cell !== null && t === "object" && !Array.isArray(cell);
                              const cellKey = `${path}-row-${idx}-col-${col}`;

                              return (
                                <TableCell
                                  key={`${path}-row-${idx}-col-${col}`}
                                  className="align-top truncate"
                                  // Add: hover highlight for table cells (array of objects)
                                  onMouseEnter={() => {
                                    if (onHoverHighlight && hoverMapping) {
                                      const cellPath = `${path}.[${idx}].${col}`;
                                      const box = hoverMapping[cellPath] || null;
                                      onHoverHighlight(box as any);
                                    }
                                  }}
                                  onMouseLeave={() => onHoverHighlight?.(null)}
                                >
                                  {t === "boolean" ? (
                                    <input type="checkbox" defaultChecked={Boolean(cell)} className="h-4 w-4" />
                                  ) : isObjCell ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpanded((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(cellKey)) next.delete(cellKey);
                                          else next.add(cellKey);
                                          return next;
                                        })
                                      }
                                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                      aria-expanded={expanded.has(cellKey)}
                                      aria-controls={`${cellKey}-expanded`}
                                      title={`View ${col} details`}
                                    >
                                      {expanded.has(cellKey) ? (
                                        <ChevronDown className="h-4 w-4" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4" />
                                      )}
                                      <span className="truncate">{col}</span>
                                    </button>
                                  ) : (
                                    <input
                                      type={t === "number" ? "number" : "text"}
                                      defaultValue={cell == null ? "" : String(cell)}
                                      className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                                    />
                                  )}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );

                        const extraRows = tableColumns
                          .map((col) => {
                            const cell = row?.[col];
                            const isObjCell =
                              cell !== null && typeof cell === "object" && !Array.isArray(cell);
                            const cellKey = `${path}-row-${idx}-col-${col}`;
                            if (!isObjCell || !expanded.has(cellKey)) return null;

                            return (
                              <TableRow key={`${cellKey}-expanded`}>
                                <TableCell
                                  id={`${cellKey}-expanded`}
                                  colSpan={tableColumns.length}
                                  className="bg-muted/30"
                                >
                                  <div className="p-2 space-y-2">
                                    <div className="text-xs font-semibold text-muted-foreground">
                                      {col} details
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                      {Object.entries(cell as Record<string, any>).map(([sk, sv]) => (
                                        <div key={`${cellKey}-${sk}`} className="rounded-md border bg-card p-2">
                                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                            {sk}
                                          </div>
                                          {sv !== null && typeof sv === "object" ? (
                                            <pre className="m-0 mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-[11px] leading-relaxed">
                                              {JSON.stringify(sv, null, 2)}
                                            </pre>
                                          ) : (
                                            <div className="mt-1 text-sm break-words">
                                              {sv == null ? "" : String(sv)}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                          .filter(Boolean) as React.ReactElement[];

                        return [mainRow, ...extraRows];
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                entries.map(([k, v]) => (
                  <TreeNode key={`${path}.${k}`} label={k} value={v} path={`${path}.${k}`} depth={depth + 1} />
                ))
              )}
            </motion.div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  };

  // Add a flag to fully hide JSON utilities (copy/download) and raw JSON content
  const showJsonTools = false;

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-expanded={!collapsed}
            aria-controls="sap-json-content"
            onClick={() => setCollapsed((v) => !v)}
            className="h-8 w-8"
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <div className="hidden">
          <Button variant="outline" size="sm" onClick={handleCopy} aria-label="Copy JSON">
            <Copy className="h-4 w-4 mr-2" />
            Copy
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload} aria-label="Download JSON">
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </CardHeader>

      {!collapsed && showJsonTools && (
        <CardContent id="sap-json-content" className="pt-0 hidden">
          <ScrollArea className="h-64 w-full rounded-md border">
            {ordered && typeof ordered === "object" ? (
              <div className="p-2">
                {Array.isArray(ordered) ? (
                  <TreeNode label="[]" value={ordered} path="$" depth={0} />
                ) : (
                  Object.entries(ordered as Record<string, any>).map(([k, v]) => (
                    <TreeNode
                      key={`$.${k}`}
                      label={k}
                      value={v}
                      path={`$.${k}`}
                      depth={0}
                    />
                  ))
                )}
              </div>
            ) : (
              <pre className="m-0 p-4 text-xs leading-relaxed whitespace-pre text-muted-foreground">
                {pretty}
              </pre>
            )}
          </ScrollArea>
        </CardContent>
      )}
    </Card>
  );
}