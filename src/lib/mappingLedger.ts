import type { DocumentData, BoundingBox } from "@/lib/supabase";

export type SapToSourceMapping = Record<string, (BoundingBox & { page?: number }) | null>;

type SourceEntry = {
  text: string;
  bbox: BoundingBox & { page?: number };
  path: string;
};

const isScalar = (v: unknown): v is string | number | boolean =>
  v === null ? false : ["string", "number", "boolean"].includes(typeof v);

const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const alnum = (s: string) => s.replace(/[^0-9A-Za-z]/g, "");
const beforeT = (s: string) => (s.includes("T") ? s.split("T")[0] : s);

function toBBox(anyBox: any): (BoundingBox & { page?: number }) | null {
  if (!anyBox || typeof anyBox !== "object") return null;

  const x = anyBox.x ?? anyBox.left ?? (typeof anyBox.right === "number" && typeof anyBox.width !== "number" ? anyBox.right - (anyBox.width ?? 0) : undefined);
  const y = anyBox.y ?? anyBox.top ?? (typeof anyBox.bottom === "number" && typeof anyBox.height !== "number" ? anyBox.bottom - (anyBox.height ?? 0) : undefined);

  const width =
    anyBox.width ??
    anyBox.w ??
    (typeof anyBox.right === "number" && typeof x === "number" ? anyBox.right - x : undefined);
  const height =
    anyBox.height ??
    anyBox.h ??
    (typeof anyBox.bottom === "number" && typeof y === "number" ? anyBox.bottom - y : undefined);

  if ([x, y, width, height].every((n) => typeof n === "number" && isFinite(n))) {
    const page = anyBox.page ?? anyBox.pageNumber ?? anyBox.p ?? undefined;
    return { x, y, width, height, ...(page != null ? { page } : {}) };
  }
  return null;
}

function tryExtractText(obj: any): string | null {
  if (obj == null) return null;
  if (typeof obj === "string") return obj;
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (typeof obj === "object") {
    const candidates = [obj.text, obj.value, obj.content, obj.raw, obj.string, obj.normalized];
    for (const c of candidates) {
      if (typeof c === "string" || typeof c === "number" || typeof c === "boolean") {
        return String(c);
      }
    }
  }
  return null;
}

function extractSourceEntries(node: any, basePath = "$"): Array<SourceEntry> {
  const out: Array<SourceEntry> = [];

  const visit = (val: any, path: string) => {
    if (Array.isArray(val)) {
      // Tuple pattern: [value, bbox]
      if (val.length === 2 && isScalar(val[0]) && typeof val[1] === "object") {
        const bb = toBBox(val[1]);
        if (bb) {
          const t = String(val[0]);
          out.push({ text: t, bbox: bb, path });
          return;
        }
      }
      // Token arrays: words/tokens with text+bbox
      if (val.length > 0 && val.every((x) => typeof x === "object")) {
        for (let i = 0; i < val.length; i++) visit(val[i], `${path}.[${i}]`);
        return;
      }
      // Generic array
      for (let i = 0; i < val.length; i++) visit(val[i], `${path}.[${i}]`);
      return;
    }

    if (val && typeof val === "object") {
      // Object with explicit bbox
      const boxLike = (val as any).bbox ?? (val as any).box ?? (val as any).region ?? null;
      if (boxLike) {
        const bb = toBBox(boxLike);
        const t = tryExtractText(val);
        if (bb && t != null && normalize(String(t)).length > 0) {
          out.push({ text: String(t), bbox: bb, path });
          // Continue to traverse to catch nested as well
        }
      }

      // Objects that directly look like a bbox (rare)
      const selfBBox = toBBox(val);
      if (selfBBox) {
        // If there is a sibling text field, prefer that
        const txt = tryExtractText(val);
        if (txt) out.push({ text: String(txt), bbox: selfBBox, path });
      }

      // Token containers: { words: [...]} or { tokens: [...] }
      if (Array.isArray((val as any).words)) {
        (val as any).words.forEach((w: any, i: number) => {
          const t = tryExtractText(w);
          const bb = toBBox(w?.bbox ?? w?.box);
          if (t && bb) out.push({ text: String(t), bbox: bb, path: `${path}.words.[${i}]` });
        });
      }
      if (Array.isArray((val as any).tokens)) {
        (val as any).tokens.forEach((w: any, i: number) => {
          const t = tryExtractText(w);
          const bb = toBBox(w?.bbox ?? w?.box);
          if (t && bb) out.push({ text: String(t), bbox: bb, path: `${path}.tokens.[${i}]` });
        });
      }

      // Recurse props
      for (const k of Object.keys(val)) {
        if (k === "bbox" || k === "box" || k === "region") continue;
        visit((val as any)[k], `${path}.${k}`);
      }
      return;
    }

    // Primitive without bbox: nothing to add
  };

  visit(node, basePath);
  return out;
}

function indexEntries(entries: Array<SourceEntry>): Map<string, Array<SourceEntry>> {
  const idx = new Map<string, Array<SourceEntry>>();
  const add = (key: string, e: SourceEntry) => {
    if (!key) return;
    const cur = idx.get(key) ?? [];
    cur.push(e);
    idx.set(key, cur);
  };
  for (const e of entries) {
    const n = normalize(String(e.text));
    const keys: Array<string> = [n, alnum(n)];
    if (n.includes("T")) keys.push(beforeT(n), alnum(beforeT(n)));
    // Also upper-cased variants
    keys.push(n.toUpperCase(), alnum(n).toUpperCase());
    for (const k of keys) add(k, e);
  }
  return idx;
}

function candidateKeysForValue(v: unknown): Array<string> {
  const s = normalize(String(v ?? ""));
  if (!s) return [];
  const keys: Array<string> = [s, alnum(s)];
  if (s.includes("T")) {
    const b = beforeT(s);
    keys.push(b, alnum(b));
  }
  keys.push(s.toUpperCase(), alnum(s).toUpperCase());
  return keys;
}

export function createSapToSourceMapping(sap: unknown, source: DocumentData | any): SapToSourceMapping {
  try {
    if (!sap || !source) return {};
    const entries = extractSourceEntries(source, "$");
    const idx = indexEntries(entries);

    const mapping: SapToSourceMapping = {};

    const walkSap = (val: any, path: string) => {
      if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) walkSap(val[i], `${path}.[${i}]`);
        return;
      }
      if (val && typeof val === "object") {
        for (const k of Object.keys(val)) walkSap(val[k], `${path}.${k}`);
        return;
      }

      // Primitive field -> attempt match
      if (isScalar(val)) {
        const keys = candidateKeysForValue(val);
        let matched: SourceEntry | null = null;

        for (const k of keys) {
          const candidates = idx.get(k);
          if (candidates && candidates.length) {
            // Prefer longer text (more specific), fallback first occurrence
            matched =
              candidates.slice().sort((a, b) => b.text.length - a.text.length)[0] ?? candidates[0];
            break;
          }
        }

        mapping[path] = matched ? matched.bbox : null;
      }
    };

    walkSap(sap, "$");
    return mapping;
  } catch {
    return {};
  }
}
