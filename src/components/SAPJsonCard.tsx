import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Download, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import * as SalesSchema from "@/schemas/salesOrderCreate";

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
    const isExpanded = expanded.has(path);
    const indentStyle = { paddingLeft: `${depth * 16}px` };

    if (!isComplex) {
      return (
        <div className="flex items-start gap-2 py-1.5 px-2 hover:bg-muted/40 rounded-md" style={indentStyle}>
          <span className="text-xs font-medium text-foreground">{label}:</span>
          <span className="text-xs font-mono text-muted-foreground break-all">
            {value === null ? "null" : typeof value === "string" ? `"${value}"` : String(value)}
          </span>
        </div>
      );
    }

    const entries = isArr(value)
      ? (value as any[]).map((v, i) => [`[${i}]`, v] as const)
      : Object.entries(value as Record<string, any>);

    return (
      <div>
        <button
          onClick={() => togglePath(path)}
          className="w-full flex items-center gap-2 py-1.5 px-2 hover:bg-muted/50 rounded-md"
          style={indentStyle}
          aria-expanded={isExpanded}
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="text-xs font-semibold text-foreground">{label}</span>
          <span className="ml-2 text-[10px] text-muted-foreground">
            {isArr(value) ? `[${(value as any[]).length}]` : `{${Object.keys(value as any).length}}`}
          </span>
        </button>
        {isExpanded && (
          <div className="mt-0.5">
            {entries.map(([k, v]) => (
              <TreeNode key={`${path}.${k}`} label={k} value={v} path={`${path}.${k}`} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
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
              <div className="p-2">
                {Array.isArray(ordered) ? (
                  <TreeNode label="[]" value={ordered} path="$" depth={0} />
                ) : (
                  Object.entries(ordered as Record<string, any>).map(([k, v]) => (
                    <TreeNode key={`$.${k}`} label={k} value={v} path={`$.${k}`} depth={0} />
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