import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Copy, Download, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import * as SalesSchema from "@/schemas/salesOrderCreate";
import { motion } from "framer-motion";
import type { DocumentData, BoundingBox } from "@/lib/supabase";
import { createSapToSourceMapping, type SapToSourceMapping } from "@/lib/mapping";

type SAPJsonCardProps = {
  data: unknown;
  title?: string;
  className?: string;
  defaultCollapsed?: boolean;
  onHoverHighlight?: (box: (BoundingBox & { page?: number; color?: string }) | null) => void;
  sourceDocumentData?: DocumentData;
  hideHeader?: boolean;
  onShowMailHint?: () => void;
  onHideMailHint?: () => void;
};

function extractJsonFromText(input: string): any | null {
  const s = input.trim();
  const fenced = s.match(/(?:^|[^\\])\{\{(.+?)\}\}/s);
  if (fenced) return JSON.parse(fenced[1]);
  try {
    return JSON.parse(s);
  } catch {
    try {
      return JSON.parse(s.replace(/"/g, '"'));
    } catch {
      return null;
    }
  }
}

export function SAPJsonCard({
  data,
  title = "SAP Data",
  className,
  defaultCollapsed = true,
  onHoverHighlight,
  sourceDocumentData,
  hideHeader,
  onShowMailHint,
  onHideMailHint,
}: SAPJsonCardProps) {
  const [collapsed, setCollapsed] = useState<boolean>(defaultCollapsed);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set<string>());
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  const hoverMapping: SapToSourceMapping | null = useMemo(() => {
    try {
      return sourceDocumentData ? createSapToSourceMapping(data, sourceDocumentData) : null;
    } catch {
      return null;
    }
  }, [data, sourceDocumentData]);

  const DEFAULT_HOVER_COLOR = "#3b82f6";
  const hoverRafRef = useRef<number | null>(null);
  const clearHoverTimeoutRef = useRef<number | null>(null);
  const hoveredSetRafRef = useRef<number | null>(null);

  const emitHover = (payload: any | null) => {
    if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current);
    hoverRafRef.current = requestAnimationFrame(() => {
      onHoverHighlight?.(payload);
    });
  };

  const handleRowEnter = (pathId: string, box: any) => {
    if (clearHoverTimeoutRef.current) {
      clearTimeout(clearHoverTimeoutRef.current);
      clearHoverTimeoutRef.current = null;
    }
    if (hoveredSetRafRef.current) cancelAnimationFrame(hoveredSetRafRef.current);
    hoveredSetRafRef.current = requestAnimationFrame(() => {
      setHoveredPath((prev: string | null) => (prev === pathId ? prev : pathId));
    });
    const colored =
      box && typeof box === "object" && !box.color ? { ...box, color: DEFAULT_HOVER_COLOR } : box;
    emitHover(colored);
  };

  const handleRowLeave = () => {
    if (clearHoverTimeoutRef.current) clearTimeout(clearHoverTimeoutRef.current);
    clearHoverTimeoutRef.current = window.setTimeout(() => {
      setHoveredPath(null);
      emitHover(null);
    }, 220);
  };

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
      } catch {}
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

  const reorderByOrderTree = (value: any, orderTree: any): any => {
    if (!orderTree) return value;
    if (Array.isArray(value)) {
      const elemTree = Array.isArray(orderTree) ? orderTree[0] : orderTree;
      return value.map((v: any) => reorderByOrderTree(v, elemTree));
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

  const ordered = useMemo(() => {
    if (!parsed || typeof parsed !== "object") return parsed;
    try {
      return orderTree ? reorderByOrderTree(parsed, orderTree) : parsed;
    } catch {
      return parsed;
    }
  }, [parsed, orderTree]);

  function unionBoxes(
    boxes: Array<BoundingBox & { page?: number }>
  ): (BoundingBox & { page?: number }) | null {
    if (!boxes.length) return null;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    let page = boxes[0]?.page;
    for (const b of boxes) {
      const x1 = (b as any).x ?? (b as any).left ?? 0;
      const y1 = (b as any).y ?? (b as any).top ?? 0;
      const x2 = x1 + ((b as any).width ?? (b as any).w ?? 0);
      const y2 = y1 + ((b as any).height ?? (b as any).h ?? 0);
      minX = Math.min(minX, x1);
      minY = Math.min(minY, y1);
      maxX = Math.max(maxX, x2);
      maxY = Math.max(maxY, y2);
      if (page == null && (b as any).page != null) page = (b as any).page;
    }
    const out: any = {
      x: minX,
      y: minY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
    };
    if (page != null) out.page = page;
    return out as BoundingBox & { page?: number };
  }

  function getRowUnionBoxForArrayObject(
    basePath: string,
    rowIndex: number,
    columns: Array<string>,
    mapping: SapToSourceMapping | null
  ): (BoundingBox & { page?: number }) | null {
    if (!mapping) return null;
    const boxes: Array<BoundingBox & { page?: number }> = [];
    for (const col of columns) {
      const p = `${basePath}.[${rowIndex}].${col}`;
      const b = mapping[p] as any;
      if (b) boxes.push(b);
    }
    return unionBoxes(boxes);
  }

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
    setExpanded((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const isObjectLike = (v: unknown) => v !== null && typeof v === "object";
  const isArr = (v: unknown): v is Array<any> => Array.isArray(v);

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

  // NEW: Render array of objects with all fields in row and sub-objects as collapsible sections
  const ArrayOfObjectsAccordion = ({
    items,
    basePath,
    depth,
  }: {
    items: Array<Record<string, any>>;
    basePath: string;
    depth: number;
  }) => {
    return (
      <div className="space-y-3">
        {items.map((item, idx) => {
          const itemPath = `${basePath}.[${idx}]`;
          const itemKeys = Object.keys(item);
          
          // Separate primitive fields from sub-objects
          const primitiveFields: Array<[string, any]> = [];
          const subObjects: Array<[string, any]> = [];
          
          itemKeys.forEach((key) => {
            const val = item[key];
            if (val !== null && typeof val === "object") {
              subObjects.push([key, val]);
            } else {
              primitiveFields.push([key, val]);
            }
          });

          const itemBox = getRowUnionBoxForArrayObject(basePath, idx, itemKeys, hoverMapping);
          const itemHasMapping = Boolean(itemBox);

          return (
            <div key={itemPath} className="border rounded-lg bg-card">
              {/* Main row with all primitive fields */}
              <div
                className="p-3 flex items-center gap-3 flex-wrap"
                style={{
                  ...(hoveredPath === itemPath
                    ? {
                        backgroundColor: "rgba(59,130,246,0.08)",
                        boxShadow: "inset 0 0 0 1px rgba(59,130,246,0.45)",
                      }
                    : {}),
                }}
                onMouseEnter={() => {
                  if (itemBox) {
                    onHideMailHint?.();
                    handleRowEnter(itemPath, itemBox as any);
                  } else {
                    setHoveredPath(itemPath);
                    onShowMailHint?.();
                  }
                }}
                onMouseLeave={() => {
                  handleRowLeave();
                  onHideMailHint?.();
                }}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                    itemHasMapping ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                  title={itemHasMapping ? "Source found" : "No source mapping"}
                />
                <span className="text-sm font-semibold text-foreground min-w-[60px]">#{idx + 1}</span>
                
                {primitiveFields.map(([key, val]) => {
                  const fieldPath = `${itemPath}.${key}`;
                  const fieldBox = hoverMapping ? hoverMapping[fieldPath] || null : null;
                  const fieldHasMapping = Boolean(fieldBox);

                  return (
                    <div
                      key={key}
                      className="flex items-center gap-2 min-w-[120px] max-w-[200px]"
                      onMouseEnter={() => {
                        if (fieldBox) {
                          onHideMailHint?.();
                          handleRowEnter(fieldPath, fieldBox as any);
                        } else {
                          setHoveredPath(fieldPath);
                          onShowMailHint?.();
                        }
                      }}
                      onMouseLeave={() => {
                        handleRowLeave();
                        onHideMailHint?.();
                      }}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                          fieldHasMapping ? "bg-emerald-400" : "bg-rose-400"
                        }`}
                      />
                      <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">{key}:</label>
                      {typeof val === "boolean" ? (
                        <input type="checkbox" defaultChecked={val} className="h-3.5 w-3.5" />
                      ) : (
                        <input
                          type={typeof val === "number" ? "number" : "text"}
                          defaultValue={val === null || val === undefined ? "" : String(val)}
                          className="flex-1 min-w-0 rounded border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            const target = e.currentTarget;
                            requestAnimationFrame(() => {
                              target.focus();
                              target.select();
                            });
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Sub-objects as collapsible sections below */}
              {subObjects.length > 0 && (
                <div className="border-t">
                  {subObjects.map(([key, val]) => {
                    const subPath = `${itemPath}.${key}`;
                    const isSubExpanded = expanded.has(subPath);
                    const isArrayOfObjects =
                      Array.isArray(val) &&
                      (val as any[]).length > 0 &&
                      (val as any[]).every((row) => row && typeof row === "object" && !Array.isArray(row));

                    return (
                      <div key={key} className="border-b last:border-b-0">
                        <button
                          onClick={() => togglePath(subPath)}
                          className="w-full px-4 py-2 flex items-center justify-between hover:bg-muted/30 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            <ChevronRight
                              className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                                isSubExpanded ? "rotate-90" : ""
                              }`}
                            />
                            <span className="text-xs font-semibold text-foreground">{key}</span>
                            <span className="text-xs text-muted-foreground">
                              {Array.isArray(val) ? `(${val.length} items)` : "(object)"}
                            </span>
                          </div>
                        </button>
                        
                        {isSubExpanded && (
                          <div className="px-4 pb-3 bg-muted/20">
                            {isArrayOfObjects ? (
                              <ArrayOfObjectsAccordion
                                items={val as Array<Record<string, any>>}
                                basePath={subPath}
                                depth={depth + 1}
                              />
                            ) : (
                              <TreeNode label="" value={val} path={subPath} depth={depth + 1} />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

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

    const isArrayOfObjects =
      Array.isArray(value) &&
      (value as any[]).length > 0 &&
      (value as any[]).every((row) => row && typeof row === "object" && !Array.isArray(row));

    if (!isComplex) {
      return (
        <div
          className="py-2.5 px-3 rounded-md"
          style={{
            ...indentStyle,
            ...(hoveredPath === path
              ? {
                  backgroundColor: "rgba(59,130,246,0.08)",
                  boxShadow: "inset 0 0 0 1px rgba(59,130,246,0.45)",
                }
              : {}),
          }}
          onMouseEnter={() => {
            const box = hoverMapping ? hoverMapping[path] || null : null;
            if (box) {
              onHideMailHint?.();
              handleRowEnter(path, box as any);
            } else {
              if (hoveredSetRafRef.current) cancelAnimationFrame(hoveredSetRafRef.current);
              hoveredSetRafRef.current = requestAnimationFrame(() => setHoveredPath(path));
              onShowMailHint?.();
            }
          }}
          onMouseLeave={() => {
            handleRowLeave();
            onHideMailHint?.();
          }}
        >
          <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-3 items-center">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full inline-block ${
                  hoverMapping && hoverMapping[path] ? "bg-emerald-500" : "bg-rose-500"
                }`}
                title={hoverMapping && hoverMapping[path] ? "Source found" : "No source mapping"}
              />
              <label className="text-xs font-medium text-muted-foreground">{label}</label>
            </div>
            {typeof value === "boolean" ? (
              <input type="checkbox" defaultChecked={value} className="h-4 w-4" />
            ) : (
              <input
                type={typeof value === "number" ? "number" : "text"}
                defaultValue={value === null || value === undefined ? "" : String(value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  const target = e.currentTarget;
                  requestAnimationFrame(() => {
                    target.focus();
                    target.select();
                  });
                }}
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
    const allImmediateLeaves = entries.every(([_, v]) => !isObjectLike(v));

    return (
      <Accordion
        type="single"
        collapsible
        value={open ? path : ""}
        onValueChange={(val) =>
          setExpanded((prev: Set<string>) => {
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
            <div
              className={
                allImmediateLeaves
                  ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1"
                  : "space-y-1 pt-1"
              }
            >
              {isArrayOfObjects ? (
                <div className="col-span-full px-2">
                  <ArrayOfObjectsAccordion items={value as Array<Record<string, any>>} basePath={path} depth={depth} />
                </div>
              ) : (
                entries.map(([k, v]) => (
                  <TreeNode key={`${path}.${k}`} label={k} value={v} path={`${path}.${k}`} depth={depth + 1} />
                ))
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  };

  const sapRootRef = useRef<HTMLDivElement | null>(null);

  const handleKeyDownCapture = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const root = sapRootRef.current;
    if (!root) return;

    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(
        "input, textarea, select, button, [tabindex]:not([tabindex='-1'])"
      )
    ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1 && el.offsetParent !== null);

    if (focusables.length === 0) return;

    const active = document.activeElement as HTMLElement | null;
    const idx = active ? focusables.indexOf(active) : -1;

    e.preventDefault();
    const nextIdx = e.shiftKey
      ? (idx <= 0 ? focusables.length - 1 : idx - 1)
      : (idx >= focusables.length - 1 ? 0 : idx + 1);

    const target = focusables[nextIdx];
    if (target) {
      target.focus();
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        const len = target.value?.length ?? 0;
        try {
          target.setSelectionRange(len, len);
        } catch {}
      }
    }
  }, []);

  useEffect(() => {
    const root = sapRootRef.current;
    if (!root) return;

    const detailsList: Array<HTMLDetailsElement> = Array.from(root.querySelectorAll("details"));
    for (const d of detailsList) {
      d.open = false;
    }

    const summaries: Array<HTMLElement> = Array.from(root.querySelectorAll("details > summary"));
    const onSummaryKey = (ev: KeyboardEvent) => {
      if (ev.key === " " || ev.key === "Enter") {
        ev.preventDefault();
        const summary = ev.currentTarget as HTMLElement;
        const dt = summary.parentElement as HTMLDetailsElement | null;
        if (dt) dt.open = !dt.open;
      }
    };

    summaries.forEach((s) => {
      s.setAttribute("tabindex", "0");
      s.setAttribute("role", "button");
      s.addEventListener("keydown", onSummaryKey);
    });

    return () => {
      summaries.forEach((s) => s.removeEventListener("keydown", onSummaryKey));
    };
  }, []);

  return (
    <div
      ref={sapRootRef}
      data-sap-interactive
      onPointerDownCapture={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDownCapture={handleKeyDownCapture}
      className="relative isolation-auto overflow-x-auto"
    >
      <Card className={className}>
        {!hideHeader && (
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                aria-expanded={!collapsed}
                aria-controls="sap-json-content"
                onClick={() => setCollapsed((v: boolean) => !v)}
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
        )}

        {!collapsed && (
          <CardContent id="sap-json-content" className="pt-0">
            <ScrollArea className="h-auto w-full rounded-md border">
              {parsed && typeof parsed === "object" && Object.keys(parsed as Record<string, any>).length > 0 ? (
                <div className="p-2">
                  {Array.isArray(parsed) ? (
                    <TreeNode label="[]" value={parsed} path="$" depth={0} />
                  ) : (
                    Object.entries(parsed as Record<string, any>).map(([k, v]) => (
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
                <div className="p-4 text-sm text-muted-foreground">No SAP data</div>
              )}
            </ScrollArea>
          </CardContent>
        )}
      </Card>
    </div>
  );
}