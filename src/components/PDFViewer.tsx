import { motion } from 'framer-motion';
import { ZoomIn, ZoomOut, RotateCcw, Loader2, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// Add worker via Vite to ensure version matches installed package
 // Vite returns a URL string for the worker file
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&url';

// Configure pdf.js worker using the bundled worker to avoid version mismatch issues
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorker;

import { Button } from '@/components/ui/button';
import { useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { BoundingBox, DocumentData as ExtractedDocumentData } from '@/lib/supabase';
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
// Add: toast for quick feedback
import { toast } from "sonner";

interface PDFViewerProps {
  pdfUrl: string;
  // Update: allow optional color for highlight
  highlightBox: (BoundingBox & { page?: number; color?: string }) | null;
  onLoad?: () => void;
  documentData?: ExtractedDocumentData;
  fitToWidthInitially?: boolean;
  fitToWidthOnResize?: boolean;
}

export default function PDFViewer({ pdfUrl, highlightBox, onLoad, documentData, fitToWidthInitially = false, fitToWidthOnResize = true }: PDFViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfArrayBuffer, setPdfArrayBuffer] = useState<ArrayBuffer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 }); // add canvas size to sync overlays
  const didFitToWidthRef = useRef(false); // ensure we only fit once
const didAutoFocusRef = useRef(false); // ensure we only auto-focus once
const [showZoomHud, setShowZoomHud] = useState(false);
const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
const pageRef = useRef<pdfjsLib.PDFPageProxy | null>(null);
const renderTaskRef = useRef<any>(null);
const baseViewportRef = useRef<{ width: number; height: number } | null>(null);

// Track the source coordinate space of incoming boxes (auto-guessed per page)
const sourceDimsRef = useRef<{ width: number; height: number } | null>(null);

// Add: detect if incoming boxes use bottom-left origin (PDF native space)
const originBottomLeftRef = useRef(false);

// Add: manual zoom mode — disables auto-fit on resize after user zooms
const manualZoomRef = useRef(false);

// Add: suppress zoom-effect-triggered render during first page render to avoid flicker
const suppressZoomEffectRef = useRef(false);

// Add: normalize/scale helpers and current page state
type WideBox = BoundingBox & { page?: number; color?: string };

// Remove Y calibration drift correction (not needed; align strictly to PDF top-left)
// const Y_CALIBRATION_PX = -2;

/**
 * Simplified normalization:
 * - Do NOT apply magnitude-based scaling (no 100/1000 heuristics).
 * - Accept either [x1,y1,x2,y2] or [x,y,w,h] array forms.
 * - For objects, prefer x2/y2 if provided; otherwise use width/height.
 * - Leave values in their original units; toPxBox will normalize if <= 1, else scale using sourceDims.
 */
function normalizeBoxAny(input: any): (BoundingBox & { page?: number }) | null {
  if (!input) return null;

  const toNum = (v: any) => (v === null || v === undefined || v === "" ? NaN : Number(v));

  // Arrays: interpret as [x1, y1, x2, y2, (page?)]
  if (Array.isArray(input)) {
    if (input.length < 4) return null;

    let x1 = toNum(input[0]);
    let y1 = toNum(input[1]);
    let x2 = toNum(input[2]);
    let y2 = toNum(input[3]);
    const page = toNum(input[4]);

    if (![x1, y1, x2, y2].every(Number.isFinite)) return null;

    // Enforce correct edge ordering
    if (x2 < x1) [x1, x2] = [x2, x1];
    if (y2 < y1) [y1, y2] = [y2, y1];

    const width = x2 - x1;
    const height = y2 - y1;
    if (width <= 0 || height <= 0) return null;

    return {
      x: x1,
      y: y1,
      width,
      height,
      page: Number.isFinite(page) ? page : undefined,
    };
  }

  // Object-like formats: prefer explicit edges x1,y1,x2,y2; fall back to x,y,width,height
  const rawX1 = toNum(input.x1 ?? input.left ?? input.minX);
  const rawY1 = toNum(input.y1 ?? input.top ?? input.minY);
  let rawX2 = toNum(input.x2 ?? input.right ?? input.maxX);
  let rawY2 = toNum(input.y2 ?? input.bottom ?? input.maxY);

  const rawX = toNum(input.x ?? input.left ?? input.x0 ?? input.startX);
  const rawY = toNum(input.y ?? input.top ?? input.y0 ?? input.startY);
  const rawW = toNum(input.width ?? input.w);
  const rawH = toNum(input.height ?? input.h);

  // If we have explicit edges, use them
  if ([rawX1, rawY1, rawX2, rawY2].every(Number.isFinite)) {
    let x1 = rawX1;
    let y1 = rawY1;
    let x2 = rawX2;
    let y2 = rawY2;
    if (x2 < x1) [x1, x2] = [x2, x1];
    if (y2 < y1) [y1, y2] = [y2, y1];
    const width = x2 - x1;
    const height = y2 - y1;
    if (width > 0 && height > 0) {
      const rawPage = input.page ?? input.page_number ?? input.pageIndex ?? input.p;
      const page = toNum(rawPage);
      return {
        x: x1,
        y: y1,
        width,
        height,
        page: Number.isFinite(page) ? page : undefined,
      };
    }
  }

  // Else try x,y,width,height or derive x2/y2
  let x = rawX;
  let y = rawY;
  let width = rawW;
  let height = rawH;

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    if (Number.isFinite(rawX) && Number.isFinite(rawY) && Number.isFinite(rawX2) && Number.isFinite(rawY2)) {
      width = rawX2 - rawX;
      height = rawY2 - rawY;
    }
  }

  const rawPage = input.page ?? input.page_number ?? input.pageIndex ?? input.p;
  const page = toNum(rawPage);

  if (
    [x, y, width, height].every(Number.isFinite) &&
    (width as number) > 0 &&
    (height as number) > 0
  ) {
    return {
      x: x as number,
      y: y as number,
      width: width as number,
      height: height as number,
      page: Number.isFinite(page) ? page : undefined,
    };
  }

  return null;
}

// Add: normalize a WideBox while preserving page & color
function normalizeWideBox(input: WideBox | null | undefined): WideBox | null {
  if (!input) return null;
  const nb = normalizeBoxAny(input);
  if (!nb) return null;
  return {
    x: nb.x,
    y: nb.y,
    width: nb.width,
    height: nb.height,
    page: (input as any).page ?? nb.page,
    color: (input as any).color,
  } as WideBox;
}

const [currentPage, setCurrentPage] = useState(1);
const [totalPages, setTotalPages] = useState(1); // Add: track total pages

// Add: state for in-browser ML detections
const [predictions, setPredictions] = useState<any[]>([]);
const [detecting, setDetecting] = useState(false);
// Add: OCR results state (word-level boxes)
const [ocrWords, setOcrWords] = useState<Array<{ x: number; y: number; w: number; h: number; text: string; conf: number }>>([]);

// Add: lightweight debug toggle for Item #1
const [showDebug, setShowDebug] = useState(false);

// Add: robust normalized edges helper that unifies arrays/objects and fixes inverted X
/**
 * Normalize any input into unit-space edges [x1,y1,x2,y2] with a top-left origin.
 * Arrays are treated STRICTLY as edges: [x1, y1, x2, y2, (page?)].
 * Objects are parsed via normalizeBoxAny and then converted to edges.
 */
function robustUnitEdges(input: any, sourceDims?: { width: number; height: number } | null) {
  const sw = sourceDims?.width ?? 1;
  const sh = sourceDims?.height ?? 1;
  const toNum = (v: any) => (v === null || v === undefined || v === "" ? NaN : Number(v));

  let x1: number | null = null;
  let y1: number | null = null;
  let x2: number | null = null;
  let y2: number | null = null;

  // Strictly handle arrays as [x1, y1, x2, y2, (page?)]
  if (Array.isArray(input)) {
    if (input.length >= 4) {
      x1 = toNum(input[0]);
      y1 = toNum(input[1]);
      x2 = toNum(input[2]);
      y2 = toNum(input[3]);
    }
  } else if (input && typeof input === "object") {
    // Prefer explicit edges directly
    x1 = toNum(input.x1 ?? input.left ?? input.minX);
    y1 = toNum(input.y1 ?? input.top ?? input.minY);
    x2 = toNum(input.x2 ?? input.right ?? input.maxX);
    y2 = toNum(input.y2 ?? input.bottom ?? input.maxY);

    // Fall back to x,y,width,height ONLY if no edges are present
    if (![x1, y1, x2, y2].every(Number.isFinite)) {
      const x = toNum(input.x ?? input.left ?? input.x0 ?? input.startX);
      const y = toNum(input.y ?? input.top ?? input.y0 ?? input.startY);
      const w = toNum(input.width ?? input.w);
      const h = toNum(input.height ?? input.h);
      if ([x, y, w, h].every(Number.isFinite)) {
        x1 = x;
        y1 = y;
        x2 = x + (w as number);
        y2 = y + (h as number);
      }
    }
  }

  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;

  // Enforce ordering
  if ((x2 as number) < (x1 as number)) [x1, x2] = [x2!, x1!];
  if ((y2 as number) < (y1 as number)) [y1, y2] = [y2!, y1!];

  // Normalize directly from raw input
  return {
    x1: (x1 as number) / sw,
    y1: (y1 as number) / sh,
    x2: (x2 as number) / sw,
    y2: (y2 as number) / sh,
  };
}

// Add: normalized edges (x1,y1,x2,y2) helpers and projection using base viewport
function toUnitEdgesTopLeft(input: any): { x1: number; y1: number; x2: number; y2: number } {
  const base = getBaseDims();
  if (!base.width || !base.height) return { x1: 0, y1: 0, x2: 0, y2: 0 };

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const toNum = (v: any) => (v === null || v === undefined || v === "" ? NaN : Number(v));

  // Arrays are always treated as [x1, y1, x2, y2]
  if (Array.isArray(input) && input.length >= 4) {
    let x1 = toNum(input[0]);
    let y1 = toNum(input[1]);
    let x2 = toNum(input[2]);
    let y2 = toNum(input[3]);

    if (![x1, y1, x2, y2].every(Number.isFinite)) return { x1: 0, y1: 0, x2: 0, y2: 0 };

    const alreadyUnit = [x1, y1, x2, y2].every((n) => n >= 0 && n <= 1);
    if (!alreadyUnit) {
      x1 = x1 / base.width;
      y1 = y1 / base.height;
      x2 = x2 / base.width;
      y2 = y2 / base.height;
    }
    return { x1: clamp01(x1), y1: clamp01(y1), x2: clamp01(x2), y2: clamp01(y2) };
  }

  // Object-like formats
  const rawX = toNum(input?.x ?? input?.left ?? input?.x0 ?? input?.x1 ?? input?.startX ?? input?.minX);
  const rawY = toNum(input?.y ?? input?.top ?? input?.y0 ?? input?.y1 ?? input?.startY ?? input?.minY);
  let rawX2 = toNum(input?.x2 ?? input?.right ?? input?.maxX);
  let rawY2 = toNum(input?.y2 ?? input?.bottom ?? input?.maxY);

  const rawW = toNum(input?.width ?? input?.w);
  const rawH = toNum(input?.height ?? input?.h);

  // Derive x2/y2 if missing
  if (!Number.isFinite(rawX2) && Number.isFinite(rawX) && Number.isFinite(rawW)) rawX2 = rawX + rawW;
  if (!Number.isFinite(rawY2) && Number.isFinite(rawY) && Number.isFinite(rawH)) rawY2 = rawY + rawH;

  if (![rawX, rawY, rawX2, rawY2].every(Number.isFinite)) return { x1: 0, y1: 0, x2: 0, y2: 0 };

  let x1 = rawX;
  let y1 = rawY;
  let x2 = rawX2;
  let y2 = rawY2;

  const alreadyUnit = [x1, y1, x2, y2].every((n) => n >= 0 && n <= 1);
  if (!alreadyUnit) {
    x1 = x1 / base.width;
    y1 = y1 / base.height;
    x2 = x2 / base.width;
    y2 = y2 / base.height;
  }

  return {
    x1: clamp01(x1),
    y1: clamp01(y1),
    x2: clamp01(x2),
    y2: clamp01(y2),
  };
}

function edgesToPxRect(edges: { x1: number; y1: number; x2: number; y2: number }) {
  const base = getBaseDims();
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const x1 = clamp01(edges.x1);
  const y1 = clamp01(edges.y1);
  const x2 = clamp01(edges.x2);
  const y2 = clamp01(edges.y2);
  const x = x1 * base.width;
  const y = y1 * base.height;
  const width = Math.max(0, x2 - x1) * base.width;
  const height = Math.max(0, y2 - y1) * base.height;
  return { x, y, width, height };
}

const getBaseDims = () => {
  // Only use the base viewport (scale = 1) to avoid double-scaling.
  const base = baseViewportRef.current;
  if (base?.width && base?.height) return base;
  return { width: 0, height: 0 };
};

// Add a reactive flag to ensure base viewport is ready before projecting boxes
const baseReady = !!(baseViewportRef.current?.width && baseViewportRef.current?.height);

// Helper: recompute whether incoming boxes use a bottom-left origin (PDF native)
const recomputeOriginGuess = () => {
  originBottomLeftRef.current = false;
};

// Returns a normalized (0..1) top-left origin box for a given input box
const toUnitBoxTopLeft = (
  box: WideBox
): { x: number; y: number; width: number; height: number } => {
  if (
    box == null ||
    typeof box.x !== "number" ||
    typeof box.y !== "number" ||
    typeof box.width !== "number" ||
    typeof box.height !== "number"
  ) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const base = getBaseDims();
  if (!base.width || !base.height) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const isNormalized =
    box.x >= 0 &&
    box.y >= 0 &&
    box.width > 0 &&
    box.height > 0 &&
    box.x <= 1 &&
    box.y <= 1 &&
    box.width <= 1 &&
    box.height <= 1;

  const src = sourceDimsRef.current;
  const srcW = src?.width && src.width > 0 ? src.width : base.width;
  const srcH = src?.height && src.height > 0 ? src.height : base.height;

  const normX = isNormalized ? box.x : box.x / srcW;
  const normW = isNormalized ? box.width : box.width / srcW;

  let normY: number;
  let normH: number;
  if (isNormalized) {
    normH = box.height;
    normY = box.y; // no inversion
  } else {
    normH = box.height / srcH;
    normY = box.y / srcH; // no inversion
  }

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  return {
    x: clamp01(normX),
    y: clamp01(normY),
    width: clamp01(normW),
    height: clamp01(normH),
  };
};

// Project to pixels from normalized top-left origin (no inversion)
const toPxBox = (box: WideBox): WideBox => {
  if (
    box == null ||
    typeof box.x !== "number" ||
    typeof box.y !== "number" ||
    typeof box.width !== "number" ||
    typeof box.height !== "number"
  ) {
    return box;
  }

  const base = getBaseDims();
  if (!base.width || !base.height) return box;

  const isNormalized =
    box.x >= 0 &&
    box.y >= 0 &&
    box.width > 0 &&
    box.height > 0 &&
    box.x <= 1 &&
    box.y <= 1 &&
    box.width <= 1 &&
    box.height <= 1;

  const src = sourceDimsRef.current;
  const srcW = src?.width && src.width > 0 ? src.width : base.width;
  const srcH = src?.height && src.height > 0 ? src.height : base.height;

  const normX = isNormalized ? box.x : box.x / srcW;
  const normW = isNormalized ? box.width : box.width / srcW;

  let normY: number;
  let normH: number;
  if (isNormalized) {
    normH = box.height;
    normY = box.y; // no inversion
  } else {
    normH = box.height / srcH;
    normY = box.y / srcH; // no inversion
  }

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const pxX = clamp01(normX) * base.width;
  const pxY = clamp01(normY) * base.height;
  const pxW = clamp01(normW) * base.width;
  const pxH = clamp01(normH) * base.height;

  return {
    x: pxX,
    y: pxY,
    width: pxW,
    height: pxH,
    page: (box as any).page,
    color: (box as any).color,
  } as WideBox;
};

  const fetchPdfProxy = useAction(api.documents.fetchPdfProxy);

  // Tighten and extend zoom bounds + guard
  const clampZoom = (value: number) => {
    const next = Number.isFinite(value) ? value : 1;
    return Math.max(0.25, Math.min(next, 4));
  };

  // Add: rounding helpers to prevent flicker around threshold scales
  const EPSILON = 0.005; // ~0.5% tolerance
  const roundScale2 = (s: number) => Number(clampZoom(s).toFixed(2));

  // Helper: direct fetch fallback for PDFs (arrayBuffer from browser with CORS)
  async function fetchPdfDirectBuffer(url: string): Promise<ArrayBuffer> {
    if (!url) throw new Error("No PDF URL provided");
    const resp = await fetch(url, { mode: "cors" });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    }
    const buf = await resp.arrayBuffer();
    if (!buf || buf.byteLength === 0) {
      throw new Error("Empty PDF buffer from direct fetch");
    }
    return buf;
  }

  // Helper: update zoom and keep the visual center stable while scrolling
  const updateZoom = (nextZoom: number, silent = false) => {
    const container = containerRef.current;
    // Round target and compare with current rounded zoom to avoid micro reflows
    const targetZoom = roundScale2(nextZoom);
    const roundedCurrent = roundScale2(zoom);
    if (Math.abs(targetZoom - roundedCurrent) <= EPSILON) {
      return; // skip tiny changes to prevent flicker
    }

    if (!container) {
      setZoom(targetZoom);
      return;
    }
    const prevZoom = zoom;

    // Mark that the user has manually changed zoom unless it's a silent (programmatic) change
    if (!silent) {
      manualZoomRef.current = true;
    }

    // Compute current center in PDF coordinates
    const centerX = (container.scrollLeft + container.clientWidth / 2) / (prevZoom || 1);
    const centerY = (container.scrollTop + container.clientHeight / 2) / (prevZoom || 1);

    setZoom(targetZoom);

    // After React state updates and render, adjust scroll so the same center stays in view
    setTimeout(() => {
      const newLeft = centerX * targetZoom - container.clientWidth / 2;
      const newTop = centerY * targetZoom - container.clientHeight / 2;
      container.scrollTo({ left: newLeft, top: newTop });
    }, 0);

    // Trigger a brief HUD to show zoom level (skip when resizing container)
    if (!silent) {
      setShowZoomHud(true);
      setTimeout(() => setShowZoomHud(false), 450);
    }
  };

  // Fast render helper: reuse parsed PDF & page and cancel in-flight renders
  const renderPage = async (scale: number) => {
    const page = pageRef.current;
    const canvas = canvasRef.current;
    if (!page || !canvas) return;

    // Cancel any in-flight render to avoid queue build-up
    try {
      renderTaskRef.current?.cancel();
    } catch {
      // ignore
    }

    const viewport = page.getViewport({ scale });
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    setCanvasSize({ width: canvas.width, height: canvas.height });

    try {
      const task = (page as any).render({ canvasContext: ctx, viewport } as any);
      renderTaskRef.current = task;
      await task.promise;
      console.log('PDFViewer: Rendered (cached page) at zoom:', scale);
    } catch (e: any) {
      if (e?.name === 'RenderingCancelledException') return;
      console.error('PDFViewer: Render error', e);
      setError(`Failed to render PDF: ${e?.message || e}`);
    }
  };

  // Compute candidate boxes from documentData and simple merging/focus logic
  const { mergedBoxes, focusBox, allBoxes, sourceDims } = useMemo(() => {
    const result = { 
      mergedBoxes: [] as BoundingBox[], 
      focusBox: null as BoundingBox | null,
      allBoxes: [] as BoundingBox[],
      sourceDims: { width: 0, height: 0 } as { width: number; height: number },
    };
    if (!documentData?.document?.pages?.length) return result;

    // Select boxes for the currently rendered PDF page (fallback to first page)
    const pages = documentData.document.pages;
    const page = pages.find((p: any) => p?.page_number === currentPage) ?? pages[0];

    // Boxes container should include optional page
    const boxes: Array<(BoundingBox & { page?: number; label?: string; value?: string })> = [];

    // Collect a field with its label and value so we can display value on the overlay
    const pushField = (label: string, field?: { value?: string; bounding_box?: any[] }) => {
      if (!field?.bounding_box?.length) return;
      field.bounding_box.forEach((b) => {
        const nb = normalizeBoxAny(b);
        if (nb) boxes.push({ ...nb, label, value: field.value });
      });
    };

    // Metadata fields
    pushField('Document Title', page?.metadata?.document_title);
    pushField('Date', page?.metadata?.date);
    pushField('Purchase Order No', page?.metadata?.purchase_order_no);
    pushField('Vendor Name', page?.parties?.vendor_information?.vendor_name);
    pushField('Vendor Address', page?.parties?.vendor_information?.address);
    pushField('Vendor Contact', page?.parties?.vendor_information?.contact_no);
    pushField('Sales Person', page?.parties?.vendor_information?.sales_person);
    pushField('Customer Name', page?.customerparties?.customer_information?.customer_name);
    pushField('Customer Address', page?.customerparties?.customer_information?.address);
    pushField('Customer Contact', page?.customerparties?.customer_information?.contact_no);
    pushField('Customer Person', page?.customerparties?.customer_information?.contact_person);
    pushField('Customer Email', page?.customerparties?.customer_information?.email_address);

    // Items (merge all boxes of each item into a single row box)
    if (Array.isArray(page?.items)) {
      page.items.forEach((item: any, idx: number) => {
        if (Array.isArray(item?.bounding_box) && item.bounding_box.length) {
          // NEW: Compute merged row edges directly from raw [x1,y1,x2,y2] or edge-objects.
          let minX1 = Number.POSITIVE_INFINITY;
          let minY1 = Number.POSITIVE_INFINITY;
          let maxX2 = Number.NEGATIVE_INFINITY;
          let maxY2 = Number.NEGATIVE_INFINITY;
          let haveAny = false;

          for (const raw of item.bounding_box as any[]) {
            let rx1: number | undefined;
            let ry1: number | undefined;
            let rx2: number | undefined;
            let ry2: number | undefined;

            if (Array.isArray(raw) && raw.length >= 4) {
              rx1 = Number(raw[0]);
              ry1 = Number(raw[1]);
              rx2 = Number(raw[2]);
              ry2 = Number(raw[3]);
            } else if (raw && typeof raw === "object") {
              const r = raw as any;
              rx1 = Number(r.x1 ?? r.left ?? r.minX);
              ry1 = Number(r.y1 ?? r.top ?? r.minY);
              rx2 = Number(r.x2 ?? r.right ?? r.maxX);
              ry2 = Number(r.y2 ?? r.bottom ?? r.maxY);
            }

            if (
              Number.isFinite(rx1) &&
              Number.isFinite(ry1) &&
              Number.isFinite(rx2) &&
              Number.isFinite(ry2)
            ) {
              // Enforce ordering
              if ((rx2 as number) < (rx1 as number)) {
                const t = rx1 as number;
                rx1 = rx2 as number;
                rx2 = t;
              }
              if ((ry2 as number) < (ry1 as number)) {
                const t = ry1 as number;
                ry1 = ry2 as number;
                ry2 = t;
              }

              // Track leftmost x1 and its y1 (tie-break on y1)
              if ((rx1 as number) < minX1) {
                minX1 = rx1 as number;
                minY1 = ry1 as number;
              } else if ((rx1 as number) === minX1 && (ry1 as number) < minY1) {
                minY1 = ry1 as number;
              }
              if ((rx2 as number) > maxX2) maxX2 = rx2 as number;
              if ((ry2 as number) > maxY2) maxY2 = ry2 as number;
              haveAny = true;
            }
          }

          if (
            haveAny &&
            Number.isFinite(minX1) &&
            Number.isFinite(minY1) &&
            Number.isFinite(maxX2) &&
            Number.isFinite(maxY2) &&
            maxX2 > minX1 &&
            maxY2 > minY1
          ) {
            const desc: string = typeof item?.description === "string" ? item.description : "";
            const value = desc ? `Item ${idx + 1}: ${desc}` : `Item ${idx + 1}`;

            // Push as BoundingBox for overlay consumption
            boxes.push({
              x: minX1,
              y: minY1,
              width: maxX2 - minX1,
              height: maxY2 - minY1,
              label: `Item ${idx + 1} (row)`,
              value,
              page: page?.page_number,
            } as any);
          }
        }
      });
    }

    // Recursively collect any bounding_box arrays anywhere on the page object
    const collectBoxes = (node: any) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(collectBoxes);
        return;
      }
      if (typeof node === 'object') {
        if (Array.isArray((node as any).bounding_box)) {
          (node as any).bounding_box.forEach((b: any) => {
            const nb = normalizeBoxAny(b);
            if (nb) boxes.push(nb);
          });
        }
        Object.values(node).forEach(collectBoxes);
      }
    };
    collectBoxes(page);

    // Simple merge for overlapping or close boxes (10px threshold)
    const threshold = 10;
    const merged: BoundingBox[] = [];
    const used = new Array(boxes.length).fill(false);
    const intersectsOrClose = (a: BoundingBox, b: BoundingBox) => {
      const ax2 = a.x + a.width, ay2 = a.y + a.height;
      const bx2 = b.x + b.width, by2 = b.y + b.height;
      const overlap = !(ax2 < b.x || bx2 < a.x || ay2 < b.y || by2 < a.y);
      if (overlap) return true;
      const close = Math.abs(a.x - b.x) <= threshold ||
                    Math.abs(ax2 - bx2) <= threshold ||
                    Math.abs(a.y - b.y) <= threshold ||
                    Math.abs(ay2 - by2) <= threshold;
      return close;
    };
    for (let i = 0; i < boxes.length; i++) {
      if (used[i]) continue;
      let cur = { ...boxes[i] };
      used[i] = true;
      let mergedThisLoop = true;
      while (mergedThisLoop) {
        mergedThisLoop = false;
        for (let j = 0; j < boxes.length; j++) {
          if (used[j]) continue;
          if (intersectsOrClose(cur, boxes[j])) {
            const nx = Math.min(cur.x, boxes[j].x);
            const ny = Math.min(cur.y, boxes[j].y);
            const nx2 = Math.max(cur.x + cur.width, boxes[j].x + boxes[j].width);
            const ny2 = Math.max(cur.y + cur.height, boxes[j].y + boxes[j].height);
            cur = { x: nx, y: ny, width: nx2 - nx, height: ny2 - ny };
            used[j] = true;
            mergedThisLoop = true;
          }
        }
      }
      merged.push(cur);
    }

    // Determine focus box (Purchase Order or Invoice regions)
    const keyLabels = /purchase\s*order|invoice\s*number/i;
    const keyBox =
      boxes.find((b: any) => b.label && keyLabels.test(String(b.label))) || null;

    // Compute source coordinate space guess from raw boxes before scaling
    // Only consider non-normalized boxes (>1) to avoid collapsing to [0..1] when normalized inputs exist.
    let maxRight = 0;
    let maxBottom = 0;
    for (const b of boxes) {
      const isNormalized =
        b.x >= 0 && b.y >= 0 && b.width > 0 && b.height > 0 &&
        b.x <= 1 && b.y <= 1 && b.width <= 1 && b.height <= 1;
      if (isNormalized) continue;
      const r = b.x + b.width;
      const bt = b.y + b.height;
      if (Number.isFinite(r) && r > maxRight) maxRight = r;
      if (Number.isFinite(bt) && bt > maxBottom) maxBottom = bt;
    }
    // Fallbacks to avoid zeros; if everything is normalized, prefer the PDF base viewport.
    const base = baseViewportRef.current;
    if (!Number.isFinite(maxRight) || maxRight <= 1) {
      maxRight = (base?.width && base.width > 0) ? base.width : 1;
    }
    if (!Number.isFinite(maxBottom) || maxBottom <= 1) {
      maxBottom = (base?.height && base.height > 0) ? base.height : 1;
    }

    result.mergedBoxes = merged;
    result.focusBox = keyBox ? { x: keyBox.x, y: keyBox.y, width: keyBox.width, height: keyBox.height } : null;
    // Preserve label/value for overlays
    result.allBoxes = boxes.map(({ x, y, width, height, page, label, value }) => (
      { x, y, width, height, page, label, value } as any
    ));
    result.sourceDims = { width: maxRight, height: maxBottom };
    return result;
  }, [documentData, currentPage]);

  // Keep source dimension guess in a ref for the projector
  useEffect(() => {
    if (sourceDims?.width && sourceDims?.height) {
      sourceDimsRef.current = sourceDims;
      // Optional: log once for diagnostics
      console.debug("PDFViewer: sourceDims guessed", sourceDims);
    }
  }, [sourceDims?.width, sourceDims?.height, currentPage]);

  // Add: auto-detect if incoming boxes use bottom-left origin and flip Y accordingly
  useEffect(() => {
    recomputeOriginGuess();
  }, [allBoxes, sourceDims?.width, sourceDims?.height, currentPage]);

  // Add: comprehensive debug snapshot for Item #1 (first item on current page)
  const item1Debug = useMemo(() => {
    try {
      if (!documentData?.document?.pages?.length) return null;
      const pages: any[] = documentData.document.pages;
      const pageObj: any = pages.find((p: any) => p?.page_number === currentPage) ?? pages[0];
      if (!pageObj) return null;

      const item = Array.isArray(pageObj?.items) ? pageObj.items[0] : undefined;
      if (!item) return null;

      const rawBoxes: any[] = Array.isArray(item?.bounding_box) ? item.bounding_box : [];

      // Choose a single normalization base: prefer guessed source dims, otherwise PDF base viewport
      const baseDims = getBaseDims();
      const src = sourceDimsRef.current && sourceDimsRef.current.width && sourceDimsRef.current.height
        ? sourceDimsRef.current
        : baseDims;
      const srcW = src.width || 1;
      const srcH = src.height || 1;

      // Normalize directly from raw [x1,y1,x2,y2] or edge-objects
      const unitEdges = rawBoxes
        .map((rb) => robustUnitEdges(rb, { width: srcW, height: srcH }))
        .filter((e): e is { x1: number; y1: number; x2: number; y2: number } => !!e);

      // Pixel rectangles (base) and at current zoom
      const pxRectsAtBase = unitEdges.map((e) => edgesToPxRect(e));
      const pxRectsAtZoom = pxRectsAtBase.map((r) => ({
        x: r.x * zoom,
        y: r.y * zoom,
        width: r.width * zoom,
        height: r.height * zoom,
      }));

      // Merge using raw edges only, then normalize once
      let minX1 = Number.POSITIVE_INFINITY;
      let minY1 = Number.POSITIVE_INFINITY;
      let maxX2 = Number.NEGATIVE_INFINITY;
      let maxY2 = Number.NEGATIVE_INFINITY;
      let any = false;

      for (const raw of rawBoxes) {
        let rx1: number | undefined;
        let ry1: number | undefined;
        let rx2: number | undefined;
        let ry2: number | undefined;

        if (Array.isArray(raw) && raw.length >= 4) {
          rx1 = Number(raw[0]);
          ry1 = Number(raw[1]);
          rx2 = Number(raw[2]);
          ry2 = Number(raw[3]);
        } else if (raw && typeof raw === "object") {
          const r = raw as any;
          rx1 = Number(r.x1 ?? r.left ?? r.minX);
          ry1 = Number(r.y1 ?? r.top ?? r.minY);
          rx2 = Number(r.x2 ?? r.right ?? r.maxX);
          ry2 = Number(r.y2 ?? r.bottom ?? r.maxY);
        }

        if (
          Number.isFinite(rx1) &&
          Number.isFinite(ry1) &&
          Number.isFinite(rx2) &&
          Number.isFinite(ry2)
        ) {
          if ((rx2 as number) < (rx1 as number)) {
            const t = rx1 as number;
            rx1 = rx2 as number;
            rx2 = t;
          }
          if ((ry2 as number) < (ry1 as number)) {
            const t = ry1 as number;
            ry1 = ry2 as number;
            ry2 = t;
          }
          if ((rx1 as number) < minX1) {
            minX1 = rx1 as number;
            minY1 = ry1 as number;
          } else if ((rx1 as number) === minX1 && (ry1 as number) < minY1) {
            minY1 = ry1 as number;
          }
          if ((rx2 as number) > maxX2) maxX2 = rx2 as number;
          if ((ry2 as number) > maxY2) maxY2 = ry2 as number;
          any = true;
        }
      }

      const mergedEdgesUnit =
        any &&
        Number.isFinite(minX1) &&
        Number.isFinite(minY1) &&
        Number.isFinite(maxX2) &&
        Number.isFinite(maxY2) &&
        maxX2 > minX1 &&
        maxY2 > minY1
          ? {
              x1: minX1 / srcW,
              y1: minY1 / srcH,
              x2: maxX2 / srcW,
              y2: maxY2 / srcH,
            }
          : null;

      const mergedPxRectAtBase = mergedEdgesUnit ? edgesToPxRect(mergedEdgesUnit) : null;
      const mergedPxRectAtZoom = mergedPxRectAtBase
        ? {
            x: mergedPxRectAtBase.x * zoom,
            y: mergedPxRectAtBase.y * zoom,
            width: mergedPxRectAtBase.width * zoom,
            height: mergedPxRectAtBase.height * zoom,
          }
        : null;

      const debug = {
        page_number: pageObj?.page_number ?? null,
        currentPage,
        totalPages,
        baseDims,
        canvasSize,
        zoom,
        sourceDimsGuess: sourceDimsRef.current ?? null,

        itemIndex: 0,
        rawBoxes,
        unitEdges,
        pxRectsAtBase,
        pxRectsAtZoom,

        mergedRow: {
          leftmostX: Number.isFinite(minX1) ? minX1 : null,
          leftmostY: Number.isFinite(minY1) ? minY1 : null,
          maxRight: Number.isFinite(maxX2) ? maxX2 : null,
          maxBottom: Number.isFinite(maxY2) ? maxY2 : null,
          mergedEdgesUnit,
          mergedPxRectAtBase,
          mergedPxRectAtZoom,
        },
      };

      console.debug("PDFViewer:item1-debug", debug);
      return debug;
    } catch (e) {
      console.warn("PDFViewer:item1-debug failed", e);
      return null;
    }
  }, [documentData, currentPage, zoom, canvasSize.width, canvasSize.height, totalPages]);

  // Fetch PDF via backend proxy; convert to ArrayBuffer for pdf.js
  useEffect(() => {
    if (pdfUrl) {
      console.log('PDFViewer: Starting PDF fetch via backend proxy (for pdfjs):', pdfUrl);
      setIsLoading(true);
      setError(null);

      fetchPdfProxy({ pdfUrl })
        .then((result: any) => {
          console.log('PDFViewer: Backend proxy response:', {
            success: result.success,
            size: result.success ? result.size : 0,
            contentType: result.success ? result.contentType : null,
          });

          if (!result.success || !result.data) {
            // Fall through to catch to try direct fetch
            throw new Error(result?.error || 'Proxy did not return PDF data');
          }

          // base64 -> Uint8Array -> ArrayBuffer (create a copy to avoid detachment)
          const binaryString = atob(result.data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const arrayBuffer = bytes.buffer.slice(0);
          const safeCopy = new Uint8Array(arrayBuffer);
          if (safeCopy.byteLength === 0) {
            throw new Error('PDF data buffer is empty (0 bytes) from proxy');
          }
          setPdfArrayBuffer(safeCopy.buffer);
          // Do NOT set isLoading(false) here; we hide loader after first page render
        })
        .catch(async (err: any) => {
          console.warn('PDFViewer: Proxy fetch failed, attempting direct fetch fallback...', err);
          try {
            const buf = await fetchPdfDirectBuffer(pdfUrl);
            setPdfArrayBuffer(buf);
            // Do NOT set isLoading(false); first page render will hide loader
          } catch (err2: any) {
            console.error('PDFViewer: Direct fetch fallback failed:', err2);
            setError(`Failed to load PDF: ${err2?.message || String(err2)}`);
            setIsLoading(false);
          }
        });
    } else {
      console.error('PDFViewer: No PDF URL provided to component');
      setError('No PDF URL available');
      setIsLoading(false);
    }
  }, [pdfUrl, fetchPdfProxy, onLoad]);

  // Load PDF and first page once per ArrayBuffer and cache for fast zoom renders
  useEffect(() => {
    if (!pdfArrayBuffer) return;
    let cancelled = false;

    (async () => {
      try {
        const bufferCopy = pdfArrayBuffer.slice(0);
        const loadingTask = pdfjsLib.getDocument({ data: bufferCopy });
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages); // Add: set total pages

        const page = await pdf.getPage(1);
        if (cancelled) return;
        pageRef.current = page;
        setCurrentPage(1); // Ensure page state is synced

        const baseViewport = page.getViewport({ scale: 1 });
        baseViewportRef.current = { width: baseViewport.width, height: baseViewport.height };
        // Do NOT override sourceDimsRef here; prefer data-derived source dims when available.

        // Compute initial scale (fit-to-width if requested)
        let initialScale = 1;
        if (fitToWidthInitially && containerRef.current && baseViewport.width) {
          const containerWidth = containerRef.current.clientWidth || 0;
          if (containerWidth) {
            initialScale = clampZoom(containerWidth / baseViewport.width);
            didFitToWidthRef.current = true;
          }
        }

        // Suppress the zoom effect during the first render to avoid double render flicker
        suppressZoomEffectRef.current = true;
        setZoom(initialScale);
        await renderPage(initialScale);
        suppressZoomEffectRef.current = false;

        // Now that the first page is fully rendered, hide the loader and fire onLoad
        setIsLoading(false);
        if (onLoad) onLoad();
      } catch (e: any) {
        if (!cancelled) {
          console.error('PDFViewer: Failed to load cached PDF/page', e);
          setError(`Failed to render PDF: ${e?.message || e}`);
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        renderTaskRef.current?.cancel();
      } catch {}
    };
  }, [pdfArrayBuffer, fitToWidthInitially]);

  // Add: page navigation helpers
  const goToPage = async (pageNum: number) => {
    if (!pdfDocRef.current) return;
    const clamped = Math.max(1, Math.min(pageNum, totalPages));
    try {
      const page = await pdfDocRef.current.getPage(clamped);
      pageRef.current = page;
      const base = page.getViewport({ scale: 1 });
      baseViewportRef.current = { width: base.width, height: base.height };
      // Do NOT override sourceDimsRef here; keep using data-derived dims when present.
      setCurrentPage(clamped);
      await renderPage(zoom);
    } catch (e) {
      console.warn('PDFViewer: failed to navigate to page', clamped, e);
    }
  };
  const handlePrevPage = () => void goToPage(currentPage - 1);
  const handleNextPage = () => void goToPage(currentPage + 1);

  // Re-render quickly on zoom using cached PDF page; cancels any in-flight render
  useEffect(() => {
    if (!pageRef.current || !canvasRef.current) return;
    // Skip during the first render to avoid competing renders and loader flicker
    if (suppressZoomEffectRef.current) return;
    renderPage(zoom);
    return () => {
      try {
        renderTaskRef.current?.cancel();
      } catch {}
    };
  }, [zoom]);

  // Fit-to-width only if explicitly requested
  useEffect(() => {
    if (!fitToWidthInitially) return;
    if (!containerRef.current || didFitToWidthRef.current) return;
    const base = baseViewportRef.current;
    if (!base) return;
    const containerWidth = containerRef.current.clientWidth;
    const targetScale = containerWidth && base.width ? containerWidth / base.width : 1;
    setZoom(clampZoom(targetScale));
    didFitToWidthRef.current = true;
  }, [pdfArrayBuffer, fitToWidthInitially]);

  // Fit PDF to container width once using cached page metrics (gate behind fitToWidthInitially)
  useEffect(() => {
    // Only fit-to-width when explicitly requested
    if (!fitToWidthInitially) return;
    if (!containerRef.current || didFitToWidthRef.current) return;
    const base = baseViewportRef.current;
    if (!base) return;
    const containerWidth = containerRef.current.clientWidth;
    const targetScale = containerWidth && base.width ? containerWidth / base.width : 1;
    setZoom(clampZoom(targetScale));
    didFitToWidthRef.current = true;
  }, [pdfArrayBuffer]);

  // Add: Automatically fit PDF to the container width when the panel is resized (debounced + tolerant)
  useEffect(() => {
    if (!fitToWidthOnResize) return;
    const container = containerRef.current;
    if (!container) return;

    let lastWidth = 0;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = entry?.contentRect?.width || 0;
      // Ignore negligible width changes to avoid oscillation around scrollbars
      if (!width || Math.abs(width - lastWidth) < 2) return;
      lastWidth = width;

      // If the user manually changed zoom, respect it and don't auto-fit
      if (manualZoomRef.current) {
        return;
      }

      const base = getBaseDims();
      if (!base.width) return;
      const rounded = roundScale2(width / base.width);
      const currentRounded = roundScale2(zoom);
      if (Math.abs(rounded - currentRounded) <= EPSILON) return;

      updateZoom(rounded, true); // silent zoom HUD on resize
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, [fitToWidthOnResize, currentPage, canvasSize.width, zoom]);

  // Also fit-to-width on window resize and orientation changes (mobile rotation) with tolerance
  useEffect(() => {
    if (!fitToWidthOnResize) return;
    const handler = () => {
      // If the user manually changed zoom, respect it and don't auto-fit
      if (manualZoomRef.current) return;

      const container = containerRef.current;
      if (!container) return;
      const base = getBaseDims();
      if (!base.width) return;
      const width = container.clientWidth;
      if (!width) return;
      const rounded = roundScale2(width / base.width);
      const currentRounded = roundScale2(zoom);
      if (Math.abs(rounded - currentRounded) <= EPSILON) return;

      updateZoom(rounded, true);
    };
    window.addEventListener('resize', handler);
    window.addEventListener('orientationchange', handler);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('orientationchange', handler);
    };
  }, [fitToWidthOnResize, currentPage, canvasSize.width, zoom]);

  // Auto-focus/zoom into key region once after load if focusBox exists
  useEffect(() => {
    if (didAutoFocusRef.current) return;
    if (!focusBox || !containerRef.current || !pdfArrayBuffer) return;

    const base = getBaseDims();
    if (!base.width || !base.height) {
      // Wait until canvas/base dims are ready
      console.debug('PDFViewer: defer initial auto-focus, base dims not ready', base);
      return;
    }

    didAutoFocusRef.current = true;
    const container = containerRef.current;

    const pxBox = toPxBox(focusBox as WideBox);
    // Enforce default 100% zoom, do not auto-zoom in
    const desiredZoom = clampZoom(1);
    setZoom(desiredZoom);
    setTimeout(() => {
      const cx = pxBox.x + pxBox.width / 2;
      const cy = pxBox.y + pxBox.height / 2;
      container.scrollTo({
        left: cx * desiredZoom - container.clientWidth / 2,
        top: cy * desiredZoom - container.clientHeight / 2,
        behavior: 'smooth',
      });
    }, 180);
  }, [focusBox, pdfArrayBuffer, canvasSize.width, canvasSize.height]);

  // Remove overriding sourceDimsRef with guessed dimensions from boxes;
  // retain the effect but make it a no-op to avoid accidental overrides.
  useEffect(() => {
    // Intentionally do not override sourceDimsRef here.
    // Using the PDF base viewport (scale=1) avoids mis-scaling when boxes don't span the full page.
  }, [sourceDims?.width, sourceDims?.height, currentPage]);

  const handleZoomIn = () => {
    const newZoom = clampZoom(zoom + 0.25);
    updateZoom(newZoom);
  };
  
  const handleZoomOut = () => {
    const newZoom = clampZoom(zoom - 0.25);
    updateZoom(newZoom);
  };
  
  const handleResetZoom = () => {
    // Re-enable auto-fit behavior on future resizes after reset
    manualZoomRef.current = false;
    setZoom(clampZoom(1));
    if (containerRef.current) {
      containerRef.current.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
    }
    setShowZoomHud(true);
    setTimeout(() => setShowZoomHud(false), 450);
  };

  // Removed OCR and detection functionality
  const runDetection = async () => {
    return;
  };

  // Add: Clear detection overlays
  // Removed OCR and detection functionality
  const clearDetections = () => {};

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        // Use updateZoom for consistent behavior and scroll-centering
        updateZoom(zoom + 0.25);
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        updateZoom(zoom - 0.25);
      }
      if (e.key === '0') {
        e.preventDefault();
        handleResetZoom();
      }
      // Add: arrow key navigation
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevPage();
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextPage();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentPage, totalPages, zoom]); // extend deps for nav

  // Keep hover-centering but do NOT auto-zoom when a box is highlighted
  useEffect(() => {
    if (!highlightBox || !containerRef.current) return;

    const maybeSwitchPageAndCenter = async () => {
      const normDims = sourceDimsRef.current && sourceDimsRef.current.width && sourceDimsRef.current.height
        ? sourceDimsRef.current
        : getBaseDims();
      const hbEdges = robustUnitEdges(highlightBox as any, normDims);
      if (
        !hbEdges ||
        !Number.isFinite(hbEdges.x1) ||
        !Number.isFinite(hbEdges.y1) ||
        !Number.isFinite(hbEdges.x2) ||
        !Number.isFinite(hbEdges.y2) ||
        hbEdges.x2 <= hbEdges.x1 ||
        hbEdges.y2 <= hbEdges.y1
      ) {
        return;
      }

      // Clamp page to [1, totalPages] and handle 0-based page indices
      const rawPage = (highlightBox as any)?.page as number | undefined;
      const targetPage =
        typeof rawPage === "number"
          ? Math.min(Math.max(rawPage <= 0 ? 1 : rawPage, 1), totalPages)
          : undefined;

      if (typeof targetPage === "number" && pdfDocRef.current && targetPage !== currentPage) {
        try {
          const page = await pdfDocRef.current.getPage(targetPage);
          pageRef.current = page;
          const base = page.getViewport({ scale: 1 });
          baseViewportRef.current = { width: base.width, height: base.height };
          setCurrentPage(targetPage);
          await renderPage(zoom);

          // Ensure any origin state matches the new page before projecting the highlight
          recomputeOriginGuess();
        } catch (e) {
          console.warn('Failed to switch page for highlight box:', e);
        }
      }

      const container = containerRef.current;
      if (!container) return;

      const base = getBaseDims();
      if (!base.width || !base.height) {
        console.debug('PDFViewer: skip hover center, base dims not ready', base);
        return;
      }

      // Project using the same edges->px rect as overlays
      const hbRect = edgesToPxRect(hbEdges);
      const boxCenterX = hbRect.x + hbRect.width / 2;
      const boxCenterY = hbRect.y + hbRect.height / 2;
      container.scrollTo({
        left: boxCenterX * zoom - container.clientWidth / 2,
        top: boxCenterY * zoom - container.clientHeight / 2,
        behavior: 'smooth',
      });
    };

    void maybeSwitchPageAndCenter();
  }, [highlightBox, zoom, currentPage, canvasSize.width, canvasSize.height]);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/30">
        <div className="text-center space-y-4 p-8">
          <div className="text-destructive text-lg font-medium">{error}</div>
          <p className="text-sm text-muted-foreground">
            Please check if the PDF URL is correct and accessible.
          </p>
          <div className="text-xs font-mono bg-muted p-4 rounded-md break-all max-w-2xl">
            {pdfUrl || 'No URL provided'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto">
      {/* Zoom HUD */}
      {showZoomHud && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -6 }}
          className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-20 rounded-full border bg-background/80 backdrop-blur px-3 py-1 text-xs font-medium shadow-sm"
        >
          {Number.isFinite(zoom) ? Math.round(zoom * 100) : 100}%
        </motion.div>
      )}

      {/* Controls pinned to the top-right of the PDF container */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1 rounded-full border bg-background/80 backdrop-blur px-2 py-1 shadow-sm">
        <Button
          variant="outline"
          size="icon"
          className="rounded-full h-8 w-8"
          onClick={handleZoomOut}
          disabled={zoom <= 0.25 || Number.isNaN(zoom)}
          aria-label="Zoom out"
          title="Zoom out (-)"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="px-3 text-sm font-medium tabular-nums">
          {Number.isFinite(zoom) ? Math.round(zoom * 100) : 100}%
        </span>
        <Button
          variant="outline"
          size="icon"
          className="rounded-full h-8 w-8"
          onClick={handleZoomIn}
          disabled={zoom >= 4 || Number.isNaN(zoom)}
          aria-label="Zoom in"
          title="Zoom in (+)"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="rounded-full h-8 w-8 ml-1"
          onClick={handleResetZoom}
          aria-label="Reset zoom"
          title="Reset zoom (0)"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>

        <div className="mx-2 h-5 w-px bg-border" />
        <Button
          variant="outline"
          size="icon"
          className="rounded-full h-8 w-8"
          onClick={handlePrevPage}
          disabled={currentPage <= 1}
          aria-label="Previous page"
          title="Previous page (←)"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2 text-xs font-medium tabular-nums">
          Pg {currentPage} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="rounded-full h-8 w-8"
          onClick={handleNextPage}
          disabled={currentPage >= totalPages}
          aria-label="Next page"
          title="Next page (→)"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {/* Add: Debug toggle */}
        <div className="mx-2 h-5 w-px bg-border" />
        <Button
          variant="outline"
          size="sm"
          className="rounded-full h-7 px-2 text-[10px] font-mono"
          onClick={() => setShowDebug((v) => !v)}
          aria-label="Toggle Item 1 Debug"
          title="Toggle Item 1 Debug"
        >
          DBG
        </Button>
      </div>

      {/* Scroll to top button inside PDF container */}
      <Button
        variant="outline"
        size="icon"
        className="absolute bottom-4 right-4 z-20 rounded-full h-8 w-8"
        onClick={() => containerRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' })}
        aria-label="Scroll to top"
        title="Scroll to top"
      >
        <ArrowUp className="h-4 w-4" />
      </Button>

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      <div
        ref={containerRef}
        className="h-full w-full min-w-0 overflow-auto relative"
        style={{ scrollBehavior: 'smooth' }}
      >
        {/* Canvas-based PDF rendering */}
        <div
          className="relative inline-block"
          style={{
            width: `${canvasSize.width}px`,
            height: `${canvasSize.height}px`,
          }}
        >
          <canvas
            ref={canvasRef}
            className="block mx-auto"
            // Ensure the canvas stays under overlays
            style={{ position: "relative", zIndex: 0 }}
          />

          {/* Subtle overlays for all boxes (normalized to base pixels, then scaled by zoom) */}
          {/* Show all bounding boxes by default - ensure canvas is ready for visibility */}
          {allBoxes.length > 0 && baseReady && canvasSize.width > 0 && canvasSize.height > 0 && (
            <>
              {allBoxes.map((box, idx) => {
                const text: string | undefined =
                  (box as any)?.value || (box as any)?.label || undefined;

                const normDims = sourceDimsRef.current && sourceDimsRef.current.width && sourceDimsRef.current.height
                  ? sourceDimsRef.current
                  : getBaseDims();
                const edges = robustUnitEdges(box, normDims);
                if (
                  !edges ||
                  !Number.isFinite(edges.x1) ||
                  !Number.isFinite(edges.y1) ||
                  !Number.isFinite(edges.x2) ||
                  !Number.isFinite(edges.y2) ||
                  edges.x2 <= edges.x1 ||
                  edges.y2 <= edges.y1
                ) {
                  return null;
                }
                const rect = edgesToPxRect(edges);

                return (
                  <>
                    <div
                      key={`box-${idx}`}
                      className="absolute pointer-events-none rounded-sm"
                      style={{
                        left: `${rect.x * zoom}px`,
                        top: `${rect.y * zoom}px`,
                        width: `${rect.width * zoom}px`,
                        height: `${rect.height * zoom}px`,
                        boxShadow: "0 0 0 1px rgba(59,130,246,0.8), 0 0 0 6px rgba(59,130,246,0.18)",
                        background: "rgba(59,130,246,0.05)",
                        zIndex: 10,
                      }}
                    />
                    {text && (
                      <Tooltip key={`label-wrap-${idx}`}>
                        <TooltipTrigger asChild>
                          <div
                            className="absolute z-[12] px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-background/85 border shadow-sm max-w-[50%] truncate pointer-events-auto cursor-help"
                            style={{
                              left: `${rect.x * zoom}px`,
                              top: `${rect.y * zoom}px`,
                            }}
                          >
                            {String(text)}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={6}>
                          <div className="text-xs space-y-1">
                            <div className="font-medium">{String(text)}</div>
                            <div className="text-muted-foreground">
                              {(() => {
                                const fmt = (n: number) => n.toFixed(4);
                                const pageStr = (box as any)?.page ? `, p:${(box as any).page}` : "";
                                return `x1:${fmt(edges.x1)}, y1:${fmt(edges.y1)}, x2:${fmt(edges.x2)}, y2:${fmt(edges.y2)}${pageStr}`;
                              })()}
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </>
                );
              })}
            </>
          )}

          {/* Hover highlight overlay (normalized to base pixels) with dynamic color */}
          {highlightBox && baseReady && (() => {
            const normDims = sourceDimsRef.current && sourceDimsRef.current.width && sourceDimsRef.current.height
              ? sourceDimsRef.current
              : getBaseDims();
            const hbEdges = robustUnitEdges(highlightBox as any, normDims);
            if (
              !hbEdges ||
              !Number.isFinite(hbEdges.x1) ||
              !Number.isFinite(hbEdges.y1) ||
              !Number.isFinite(hbEdges.x2) ||
              !Number.isFinite(hbEdges.y2) ||
              hbEdges.x2 <= hbEdges.x1 ||
              hbEdges.y2 <= hbEdges.y1
            ) {
              return null;
            }
            const hbRect = edgesToPxRect(hbEdges);

            const withAlpha = (hex: string, alphaHex: string) => {
              if (typeof hex === 'string' && /^#([0-9a-f]{6})$/i.test(hex)) {
                return `${hex}${alphaHex}`;
              }
              return hex;
            };

            const baseColor = (highlightBox as any).color || '#3b82f6';
            const ring = baseColor;
            const glow = withAlpha(baseColor, '59');
            const fill = withAlpha(baseColor, '33');
            const fieldText =
              (highlightBox as any)?.value ||
              (highlightBox as any)?.label ||
              (highlightBox as any)?.text;

            // Build label from robustUnitEdges (JSON-normalized), not from canvas/base
            const label = fieldText
              ? String(fieldText)
              : (() => {
                  const fmt = (n: number) => Math.round(n * 1000) / 1000;
                  const pageStr = (highlightBox as any)?.page ? `, p:${(highlightBox as any).page}` : "";
                  return `x1:${fmt(hbEdges.x1)}, y1:${fmt(hbEdges.y1)}, x2:${fmt(hbEdges.x2)}, y2:${fmt(hbEdges.y2)}${pageStr}`;
                })();

            return (
              <>
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute pointer-events-none rounded-md z-50"
                  style={{
                    left: `${hbRect.x * zoom}px`,
                    top: `${hbRect.y * zoom}px`,
                    width: `${hbRect.width * zoom}px`,
                    height: `${hbRect.height * zoom}px`,
                    boxShadow: `0 0 0 4px ${ring}, 0 0 0 8px ${glow}`,
                    background: fill,
                    filter: "drop-shadow(0 10px 28px rgba(0,0,0,0.30))",
                    willChange: "transform, opacity",
                  }}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="absolute z-[60] px-2 py-1 rounded-md text-[10px] font-medium bg-background/85 border shadow-sm pointer-events-auto cursor-help"
                      style={{
                        left: `${hbRect.x * zoom}px`,
                        top: `${hbRect.y * zoom}px`,
                        transform: "translateY(-4px)",
                        whiteSpace: "nowrap",
                        borderColor: ring,
                      }}
                    >
                      {label}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={6}>
                    <div className="text-xs space-y-1">
                      <div className="font-medium">{label}</div>
                      <div className="text-muted-foreground">
                        {
                          (() => {
                            const fmt = (n: number) => n.toFixed(4);
                            const pageStr = (highlightBox as any)?.page ? `, p:${(highlightBox as any).page}` : "";
                            // Always display the JSON-normalized unit edges
                            return `x1:${fmt(hbEdges.x1)}, y1:${fmt(hbEdges.y1)}, x2:${fmt(hbEdges.x2)}, y2:${fmt(hbEdges.y2)}${pageStr}`;
                          })()
                        }
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </>
            );
          })()}

          {/* COCO-SSD detection overlays (from canvas pixel coords; scaled by zoom) */}
          {predictions.length > 0 && (
            <>
              {predictions.map((p: any, idx: number) => {
                const [x, y, w, h] = p?.bbox || [0, 0, 0, 0];
                const left = x * zoom;
                const top = y * zoom;
                const width = w * zoom;
                const height = h * zoom;

                // amber-500 color scheme
                const ring = "#f59e0b";
                const glow = "#f59e0b55";
                const fill = "#f59e0b22";
                const label = `${p?.class ?? "object"} ${p?.score ? `(${Math.round((p.score as number) * 100)}%)` : ""}`;

                return (
                  <div key={`det-${idx}`}>
                    <div
                      className="absolute pointer-events-none rounded-md z-40"
                      style={{
                        left: `${left}px`,
                        top: `${top}px`,
                        width: `${width}px`,
                        height: `${height}px`,
                        boxShadow: `0 0 0 3px ${ring}, 0 0 0 7px ${glow}`,
                        background: fill,
                        filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.25))",
                      }}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className="absolute z-[41] px-2 py-1 rounded-md text-[10px] font-medium bg-background/85 border shadow-sm pointer-events-auto cursor-help"
                          style={{
                            left: `${left}px`,
                            top: `${Math.max(0, top - 22)}px`,
                            whiteSpace: "nowrap",
                            borderColor: ring,
                          }}
                        >
                          {label}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent sideOffset={6}>
                        <div className="text-xs space-y-1">
                          <div className="font-medium">{label}</div>
                          <div className="text-muted-foreground">
                            x:{Math.round(x)}, y:{Math.round(y)}, w:{Math.round(w)}, h:{Math.round(h)}
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                );
              })}
            </>
          )}

          {/* OCR overlays (Tesseract.js word boxes; from canvas pixel coords; scaled by zoom) */}
          {ocrWords.length > 0 && (
            <>
              {ocrWords.map((w, idx) => {
                const left = w.x * zoom;
                const top = w.y * zoom;
                const width = w.w * zoom;
                const height = w.h * zoom;

                // green-500 color scheme
                const ring = "#22c55e";
                const glow = "#22c55e55";
                const fill = "#22c55e22";
                const label = w.text || "(word)";
                const conf =
                  Number.isFinite(w.conf) && (w.conf as number) >= 0
                    ? ` (${Math.round((w.conf as number))}%)`
                    : "";

                return (
                  <div key={`ocr-${idx}`}>
                    <div
                      className="absolute pointer-events-none rounded-sm z-30"
                      style={{
                        left: `${left}px`,
                        top: `${top}px`,
                        width: `${width}px`,
                        height: `${height}px`,
                        boxShadow: `0 0 0 2px ${ring}, 0 0 0 6px ${glow}`,
                        background: fill,
                        filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.22))",
                      }}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className="absolute z-[31] px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-background/85 border shadow-sm pointer-events-auto cursor-help"
                          style={{
                            left: `${left}px`,
                            top: `${Math.max(0, top - 18)}px`,
                            whiteSpace: "nowrap",
                            borderColor: ring,
                          }}
                        >
                          {label}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent sideOffset={6}>
                        <div className="text-xs space-y-1">
                          <div className="font-medium">
                            {label}
                            {conf}
                          </div>
                          <div className="text-muted-foreground">
                            x:{Math.round(w.x)}, y:{Math.round(w.y)}, w:{Math.round(w.w)}, h:{Math.round(w.h)}
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* Add: Item #1 debug panel */}
      {showDebug && item1Debug && (
        <div className="absolute bottom-4 left-4 z-20 max-h-64 w-[min(420px,90vw)] overflow-auto rounded-md border bg-background/90 backdrop-blur p-2 text-xs font-mono">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold">Item #1 Debug</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => {
                  try {
                    navigator.clipboard?.writeText(JSON.stringify(item1Debug, null, 2));
                  } catch {}
                }}
              >
                Copy
              </Button>
              <Button variant="outline" size="sm" className="h-7" onClick={() => setShowDebug(false)}>
                Close
              </Button>
            </div>
          </div>
          <pre className="whitespace-pre-wrap break-all">
            {JSON.stringify(item1Debug, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// Add a named export for compatibility with namespace imports like `PDFViewer.PDFViewer`
export { PDFViewer };