import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Copy, Download, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import * as SalesSchema from "@/schemas/salesOrderCreate";
import { motion } from "framer-motion";

type SAPJsonCardProps = {
  data: unknown;
  title?: string;
  className?: string;
  defaultCollapsed?: boolean;
};

export function SAPJsonCard({
  data,
  title = "SAP JSON",
  className,
  defaultCollapsed = false,
}: SAPJsonCardProps) {
  const [collapsed, setCollapsed] = useState<boolean>(defaultCollapsed);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set<string>());
  const [initExpandedApplied, setInitExpandedApplied] = useState<boolean>(false);
  const [rootExpanded, setRootExpanded] = useState<Set<string>>(() => new Set<string>());

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

  // Compute all expandable object/array paths so we can expand/collapse all and default-open
  const computeAllExpandablePaths = (value: any, path: string = "$"): Array<string> => {
    const paths: Array<string> = [];
    const isObj = value !== null && typeof value === "object";
    if (!isObj) return paths;
    paths.push(path);
    if (Array.isArray(value)) {
      (value as Array<any>).forEach((v, i) => {
        paths.push(...computeAllExpandablePaths(v, `${path}.[${i}]`));
      });
    } else {
      Object.entries(value as Record<string, any>).forEach(([k, v]) => {
        paths.push(...computeAllExpandablePaths(v, `${path}.${k}`));
      });
    }
    return paths;
  };

  const allExpandablePaths = useMemo<Array<string>>(() => {
    if (!ordered || typeof ordered !== "object") return [];
    try {
      return computeAllExpandablePaths(ordered, "$");
    } catch {
      return [];
    }
  }, [ordered]);

  // Default to expanded on initial render when data is available
  useEffect(() => {
    if (!initExpandedApplied && allExpandablePaths.length > 0) {
      setExpanded(new Set(allExpandablePaths));
      // Also expand all root sections initially so the UI is visible immediately
      setRootExpanded(new Set(rootKeys));
      setInitExpandedApplied(true);
    }
  }, [allExpandablePaths, rootKeys, initExpandedApplied]);

  // Add: derive root keys for expand/collapse all at the section level
  const rootKeys = useMemo<Array<string>>(() => {
    if (!ordered || typeof ordered !== "object" || Array.isArray(ordered)) return [];
    try {
      return Object.keys(ordered as Record<string, any>);
    } catch {
      return [];
    }
  }, [ordered]);

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
    sectionColor,
  }: {
    label: string;
    value: any;
    path: string;
    depth: number;
    sectionColor?: string;
  }) => {
    const isComplex = isObjectLike(value);
    const indentStyle = { paddingLeft: `${depth * 16}px` };

    if (!isComplex) {
      // Replace simple leaf rendering to match DocumentFields FieldItem style
      return (
        <div
          className="py-2.5 px-3 rounded-lg transition-all border bg-card/50 hover:bg-primary/5 hover:border-primary/30 hover:shadow-sm border-l-2"
          style={{ ...indentStyle, borderLeftColor: sectionColor || 'transparent' }}
        >
          <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-2">
            {sectionColor && <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: sectionColor }} />}
            {label}
          </div>
          <div className="text-sm font-medium text-foreground break-words whitespace-pre-wrap">
            {value === null ? "null" : typeof value === "string" ? `"${value}"` : String(value)}
          </div>
        </div>
      );
    }

    const entries = isArr(value)
      ? (value as any[]).map((v, i) => [`[${i}]`, v] as const)
      : Object.entries(value as Record<string, any>);

    const open = expanded.has(path);

    // NEW: determine when immediate children are all leaves to layout as an auto-fit grid
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
          {/* Update trigger to match DocumentFields SectionHeader style */}
          <AccordionTrigger
            className="w-full flex items-center justify-between py-2.5 px-3 hover:bg-muted/50 transition-colors rounded-lg group"
            style={indentStyle}
          >
            <div className="flex items-center gap-2">
              {sectionColor && <span className="inline-block h-3 w-1.5 rounded-sm" style={{ backgroundColor: sectionColor }} />}
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
                  ? "grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-1 pt-1"
                  : "space-y-1 pt-1"
              }
            >
              {entries.map(([k, v]) => (
                <TreeNode
                  key={`${path}.${k}`}
                  label={k}
                  value={v}
                  path={`${path}.${k}`}
                  depth={depth + 1}
                  sectionColor={sectionColor}
                />
              ))}
            </motion.div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  };

  // Add: Root SectionHeader matching DocumentFields style
  const RootSectionHeader = ({
    title,
    id,
    color,
    isOpen,
    onToggle,
  }: {
    title: string;
    id: string;
    color: string;
    isOpen: boolean;
    onToggle: (id: string) => void;
  }) => {
    return (
      <button
        onClick={() => onToggle(id)}
        className="flex items-center justify-between w-full py-2.5 px-3 hover:bg-muted/50 transition-colors rounded-lg group"
      >
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-1.5 rounded-sm" style={{ backgroundColor: color }} />
          <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
            {title}
          </h3>
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        )}
      </button>
    );
  };

  // Toggle a root section
  const toggleRoot = (id: string) => {
    setRootExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setExpanded(new Set(allExpandablePaths));
              setRootExpanded(new Set(rootKeys));
            }}
            aria-label="Expand all"
            title="Expand all"
          >
            Expand all
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setExpanded(new Set());
              setRootExpanded(new Set());
            }}
            aria-label="Collapse all"
            title="Collapse all"
          >
            Collapse all
          </Button>
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

      {!collapsed && (
        <CardContent id="sap-json-content" className="pt-0">
          <ScrollArea className="h-64 w-full rounded-md border">
            {ordered && typeof ordered === "object" ? (
              <div className="p-2 space-y-2">
                {Array.isArray(ordered) ? (
                  // Root is an array: show a single tree
                  <TreeNode label="[]" value={ordered} path="$" depth={0} />
                ) : (
                  // Root is an object: render top-level sections similar to DocumentFields
                  Object.entries(ordered as Record<string, any>).map(([k, v]) => {
                    const color = colorForKey(k);
                    const open = rootExpanded.has(k);
                    // NEW: compute grid layout for immediate children if they are leaves
                    const objectEntries = isObjectLike(v) && !Array.isArray(v)
                      ? Object.entries(v as Record<string, any>)
                      : [];
                    const rootAllLeaves =
                      objectEntries.length > 0 &&
                      objectEntries.every(([_, sv]) => !isObjectLike(sv));

                    return (
                      <div
                        key={k}
                        className="space-y-1.5 bg-card rounded-lg border p-2 border-l-2"
                        style={{ borderLeftColor: color }}
                      >
                        <RootSectionHeader
                          title={k}
                          id={k}
                          color={color}
                          isOpen={open}
                          onToggle={toggleRoot}
                        />
                        {open && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            transition={{ duration: 0.18, ease: "easeOut" }}
                            className="pt-1"
                          >
                            {isObjectLike(v) ? (
                              Array.isArray(v) ? (
                                <TreeNode label="[]" value={v} path={`$.${k}`} depth={0} sectionColor={color} />
                              ) : (
                                <div
                                  className={
                                    rootAllLeaves
                                      ? "grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-1"
                                      : "space-y-1"
                                  }
                                >
                                  {Object.entries(v as Record<string, any>).map(([sk, sv]) => (
                                    <TreeNode
                                      key={`$.${k}.${sk}`}
                                      label={sk}
                                      value={sv}
                                      path={`$.${k}.${sk}`}
                                      depth={0}
                                      sectionColor={color}
                                    />
                                  ))}
                                </div>
                              )
                            ) : (
                              <div className="flex items-start gap-2 py-1.5 px-2 rounded-md">
                                <span className="inline-block h-2 w-2 rounded-full mt-1" style={{ backgroundColor: color }} />
                                <span className="text-xs font-medium text-foreground">{k}:</span>
                                <span className="text-xs font-mono text-muted-foreground break-all">
                                  {v === null ? "null" : typeof v === "string" ? `"${v}"` : String(v)}
                                </span>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </div>
                    );
                  })
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