import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Download, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

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

  const pretty = useMemo(() => {
    try {
      if (typeof data === "string") {
        if (!data.trim()) return "// Empty";
        const parsed = JSON.parse(data);
        return JSON.stringify(parsed, null, 2);
      }
      if (data == null) return "// No data";
      return JSON.stringify(data, null, 2);
    } catch {
      // Not JSON-parsable string; show as-is
      return String(data);
    }
  }, [data]);

  const parsed = useMemo(() => {
    try {
      if (typeof data === "string") return JSON.parse(data);
      if (data == null) return null;
      return data as any;
    } catch {
      return null;
    }
  }, [data]);

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
            {parsed && typeof parsed === "object" ? (
              <div className="p-2">
                {Array.isArray(parsed) ? (
                  <TreeNode label="[]" value={parsed} path="$" depth={0} />
                ) : (
                  Object.entries(parsed as Record<string, any>).map(([k, v]) => (
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