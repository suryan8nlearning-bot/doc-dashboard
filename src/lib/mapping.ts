import type { BoundingBox, DocumentData } from "@/lib/supabase";

/**
 * Normalize a variety of bbox shapes to {x,y,width,height,page?}.
 * Accepts arrays like [x1,y1,x2,y2,(page?)] or objects with x1,y1,x2,y2 or x,y,width,height.
 */
function normalizeBoxAny(input: any, pageOverride?: number): (BoundingBox & { page?: number }) | null {
  if (!input) return null;

  const toNum = (v: any) => (v === null || v === undefined || v === "" ? NaN : Number(v));

  if (Array.isArray(input)) {
    if (input.length < 4) return null;
    let x1 = toNum(input[0]);
    let y1 = toNum(input[1]);
    let x2 = toNum(input[2]);
    let y2 = toNum(input[3]);
    const page = toNum(input[4]);

    if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
    if (x2 < x1) [x1, x2] = [x2, x1];
    if (y2 < y1) [y1, y2] = [y2, y1];
    const width = x2 - x1;
    const height = y2 - y1;
    if (width <= 0 || height <= 0) return null;
    return { x: x1, y: y1, width, height, page: Number.isFinite(pageOverride) ? pageOverride : (Number.isFinite(page) ? page : undefined) };
  }

  const rawX1 = toNum(input.x1 ?? input.left ?? input.minX);
  const rawY1 = toNum(input.y1 ?? input.top ?? input.minY);
  let rawX2 = toNum(input.x2 ?? input.right ?? input.maxX);
  let rawY2 = toNum(input.y2 ?? input.bottom ?? input.maxY);

  const rawX = toNum(input.x ?? input.left ?? input.x0 ?? input.startX);
  const rawY = toNum(input.y ?? input.top ?? input.y0 ?? input.startY);
  const rawW = toNum(input.width ?? input.w);
  const rawH = toNum(input.height ?? input.h);

  if ([rawX1, rawY1, rawX2, rawY2].every(Number.isFinite)) {
    let x1 = rawX1, y1 = rawY1, x2 = rawX2, y2 = rawY2;
    if (x2 < x1) [x1, x2] = [x2, x1];
    if (y2 < y1) [y1, y2] = [y2, y1];
    const width = x2 - x1;
    const height = y2 - y1;
    if (width > 0 && height > 0) {
      return { x: x1, y: y1, width, height, page: Number.isFinite(pageOverride) ? pageOverride : undefined };
    }
  }

  let x = rawX, y = rawY, width = rawW, height = rawH;
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    if (Number.isFinite(rawX) && Number.isFinite(rawY) && Number.isFinite(rawX2) && Number.isFinite(rawY2)) {
      width = rawX2 - rawX;
      height = rawY2 - rawY;
    }
  }

  if ([x, y, width, height].every(Number.isFinite) && (width as number) > 0 && (height as number) > 0) {
    return { x: x as number, y: y as number, width: width as number, height: height as number, page: Number.isFinite(pageOverride) ? pageOverride : undefined };
  }
  return null;
}

type SourceEntry = {
  text: string;
  path: string;
  box: BoundingBox & { page?: number };
};

/**
 * Extracts text + bbox + path from the structured document_data JSON.
 * Focuses on commonly-present sections; safely skips missing ones.
 */
export function extractSourceEntries(documentData: DocumentData): Array<SourceEntry> {
  const out: Array<SourceEntry> = [];
  const doc = documentData?.document;
  if (!doc?.pages || !Array.isArray(doc.pages)) return out;

  for (const page of doc.pages as Array<any>) {
    const pageNum = Number(page?.page_number);
    const addField = (path: string, node: any) => {
      if (!node) return;
      const val = node.value ?? node.text ?? node.string ?? null;
      const bbox = node.bounding_box ?? node.bbox ?? node.box ?? null;
      if (val == null) return;
      const s = String(val).trim();
      if (!s) return;
      const first = Array.isArray(bbox) ? bbox[0] : null;
      const norm = normalizeBoxAny(first, Number.isFinite(pageNum) ? pageNum : undefined);
      if (!norm) return;
      out.push({ text: s, path, box: norm });
    };

    // metadata
    const md = page?.metadata;
    if (md && typeof md === "object") {
      for (const k of Object.keys(md)) {
        addField(`document.metadata.${k}`, (md as any)[k]);
      }
    }

    // parties.vendor_information
    const vi = page?.parties?.vendor_information;
    if (vi && typeof vi === "object") {
      for (const k of Object.keys(vi)) {
        addField(`document.parties.vendor_information.${k}`, (vi as any)[k]);
      }
    }

    // customerparties.customer_information
    const ci = page?.customerparties?.customer_information;
    if (ci && typeof ci === "object") {
      for (const k of Object.keys(ci)) {
        addField(`document.customerparties.customer_information.${k}`, (ci as any)[k]);
      }
    }

    // items: item-level bbox; attribute texts map to item bbox
    const items = Array.isArray(page?.items) ? page.items as Array<any> : [];
    items.forEach((item, i) => {
      const ibox = normalizeBoxAny(Array.isArray(item?.bounding_box) ? item.bounding_box[0] : null, Number.isFinite(pageNum) ? pageNum : undefined);
      const addItemField = (key: string) => {
        const v = item?.[key];
        if (v == null) return;
        const s = String(v).trim();
        if (!s) return;
        if (ibox) out.push({ text: s, path: `document.items[${i}].${key}`, box: ibox });
      };
      addItemField("description");
      addItemField("quantity");
      addItemField("unit_price");
      addItemField("total");
      // any other string keys on item -> map to same item bbox
      for (const k of Object.keys(item ?? {})) {
        if (["bounding_box", "description", "quantity", "unit_price", "total"].includes(k)) continue;
        const val = item?.[k];
        if (typeof val === "string" && val.trim()) {
          if (ibox) out.push({ text: val.trim(), path: `document.items[${i}].${k}`, box: ibox });
        }
      }
    });

    // other_information: array of objects with fields having bbox
    const others = Array.isArray(page?.other_information) ? page.other_information as Array<any> : [];
    others.forEach((info, idx) => {
      if (info?.additional_notes) addField(`document.other_information[${idx}].additional_notes`, info.additional_notes);
      if (info?.title) addField(`document.other_information[${idx}].title`, info.title);
    });
  }

  return out;
}

function sapTraverse(
  value: any,
  path: string,
  cb: (path: string, val: string) => void
) {
  if (value == null) return;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "bigint" || t === "boolean") {
    const s = String(value).trim();
    if (s) cb(path, s);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => sapTraverse(v, `${path}.[${i}]`, cb));
    return;
  }
  if (t === "object") {
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      sapTraverse(v, `${path}.${k}`, cb);
    }
  }
}

export type SapToSourceMapping = Record<string, ((BoundingBox & { page?: number }) | null)>;

/**
 * Build a mapping from SAP JSON leaf paths -> bounding box from document_data by exact text match.
 * Path format matches SAPJsonCard's TreeNode ("$" root, dot, and .[i] for array indices).
 */
export function createSapToSourceMapping(sapData: any, documentData: DocumentData): SapToSourceMapping {
  const mapping: SapToSourceMapping = {};
  if (!sapData || !documentData) return mapping;

  const entries = extractSourceEntries(documentData);
  // Map text -> entries (handle duplicates)
  const byText: Record<string, Array<SourceEntry>> = {};
  for (const e of entries) {
    if (!byText[e.text]) byText[e.text] = [];
    byText[e.text].push(e);
  }

  // Walk SAP JSON
  sapTraverse(sapData, "$", (sapPath, sapText) => {
    const matches = byText[sapText] ?? [];
    // Simple heuristic: prefer first match
    const best = matches[0] ?? null;
    mapping[sapPath] = best ? best.box : null;
  });

  return mapping;
}
