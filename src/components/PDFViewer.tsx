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

interface PDFViewerProps {
  pdfUrl: string;
  highlightBox: BoundingBox | null;
  onLoad?: () => void;
  documentData?: ExtractedDocumentData;
  // Add: opt-in initial fit-to-width (default false to keep 100% zoom)
  fitToWidthInitially?: boolean;
  // Add: fit PDF to container width whenever the panel is resized (default true)
  fitToWidthOnResize?: boolean;
}

export function PDFViewer({ pdfUrl, highlightBox, onLoad, documentData, fitToWidthInitially = false, fitToWidthOnResize = true }: PDFViewerProps) {
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

// Add: manual zoom mode — disables auto-fit on resize after user zooms
const manualZoomRef = useRef(false);

// Add: debugging and Y-axis handling state
const [invertY, setInvertY] = useState(true);
const [debugMode, setDebugMode] = useState(false);

// Add: normalize/scale helpers and current page state
type WideBox = BoundingBox & { page?: number };

// Normalize incoming bounding boxes to a standard shape for rendering
function normalizeBoxAny(input: any): (BoundingBox & { page?: number }) | null {
  if (!input) return null;
  const toNum = (v: any) => (v === null || v === undefined || v === '' ? NaN : Number(v));

  if (Array.isArray(input)) {
    if (input.length < 4) return null;
    const x1 = toNum(input[0]);
    const y1 = toNum(input[1]);
    const a2 = toNum(input[2]);
    const b2 = toNum(input[3]);
    const page = toNum(input[4]);

    // Prefer interpreting arrays as [x1, y1, x2, y2, (page?)]
    let width = a2 - x1;
    let height = b2 - y1;

    // Fallback: if that produces invalid values, treat as [x, y, w, h, (page?)]
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      width = a2;
      height = b2;
    }

    if ([x1, y1, width, height].every(Number.isFinite) && width > 0 && height > 0) {
      return { x: x1, y: y1, width, height, page: Number.isFinite(page) ? page : undefined };
    }
    return null;
  }

  const x = toNum(input.x ?? input.left ?? input.x0 ?? input.x1 ?? input.startX ?? input.minX);
  const y = toNum(input.y ?? input.top ?? input.y0 ?? input.y1 ?? input.startY ?? input.minY);

  let width = toNum(input.width ?? input.w);
  let height = toNum(input.height ?? input.h);

  if (!Number.isFinite(width)) {
    const x2 = toNum(input.x2 ?? input.right ?? input.maxX);
    if (Number.isFinite(x) && Number.isFinite(x2)) width = x2 - x;
  }
  if (!Number.isFinite(height)) {
    const y2 = toNum(input.y2 ?? input.bottom ?? input.maxY);
    if (Number.isFinite(y) && Number.isFinite(y2)) height = y2 - y;
  }

  const rawPage = input.page ?? input.page_number ?? input.pageIndex ?? input.p;
  const page = toNum(rawPage);

  if ([x, y, width, height].every(Number.isFinite)) {
    return { x, y, width, height, page: Number.isFinite(page) ? page : undefined };
  }
  return null;
}

const [currentPage, setCurrentPage] = useState(1);
const [totalPages, setTotalPages] = useState(1); // Add: track total pages

const getBaseDims = () => {
  const base = baseViewportRef.current;
  if (base?.width && base?.height) return base;
  const canvas = canvasRef.current;
  if (canvas?.width && canvas?.height) {
    return { width: canvas.width, height: canvas.height };
  }
  // Fallback to tracked canvasSize state if canvasRef isn't ready yet
  if (canvasSize.width && canvasSize.height) {
    return { width: canvasSize.width, height: canvasSize.height };
  }
  return { width: 0, height: 0 };
};

const toPxBox = (box: WideBox): WideBox => {
  // Guard missing values
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

  // Heuristic: if coords are <= 1, treat as normalized [0..1]
  const isNormalized =
    box.x >= 0 &&
    box.y >= 0 &&
    box.width > 0 &&
    box.height > 0 &&
    box.x <= 1 &&
    box.y <= 1 &&
    box.width <= 1 &&
    box.height <= 1;

  // Auto-detect the source coordinate space (e.g., OCR pixel space)
  const src = sourceDimsRef.current;
  const srcW = src?.width && src.width > 0 ? src.width : base.width;
  const srcH = src?.height && src.height > 0 ? src.height : base.height;

  // Map source -> canvas base pixels
  let pxX = isNormalized ? box.x * base.width : (box.x / srcW) * base.width;
  let pxY = isNormalized ? box.y * base.height : (box.y / srcH) * base.height;
  let pxW = isNormalized ? box.width * base.width : (box.width / srcW) * base.width;
  let pxH = isNormalized ? box.height * base.height : (box.height / srcH) * base.height;

  // Optional bottom-left → top-left conversion
  if (invertY) {
    pxY = base.height - (pxY + pxH);
  }

  return { x: pxX, y: pxY, width: pxW, height: pxH, page: (box as any).page } as WideBox;
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
    const boxes: Array<(BoundingBox & { page?: number; label?: string })> = [];

    const pushField = (label: string, field?: { value?: string; bounding_box?: any[] }) => {
      if (!field?.bounding_box?.length) return;
      field.bounding_box.forEach((b) => {
        const nb = normalizeBoxAny(b);
        if (nb) boxes.push({ ...nb, label });
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

    // Items (merge each item's bounding_box)
    if (Array.isArray(page?.items)) {
      page.items.forEach((item: any, idx: number) => {
        if (item?.bounding_box?.length) {
          item.bounding_box.forEach((b: any) => {
            const nb = normalizeBoxAny(b);
            if (nb) boxes.push({ ...nb, label: `Item ${idx + 1}` });
          });
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
    let maxRight = 0;
    let maxBottom = 0;
    for (const b of boxes) {
      const r = b.x + b.width;
      const bt = b.y + b.height;
      if (Number.isFinite(r) && r > maxRight) maxRight = r;
      if (Number.isFinite(bt) && bt > maxBottom) maxBottom = bt;
    }
    // Fallbacks to avoid zeros
    if (!Number.isFinite(maxRight) || maxRight <= 0) maxRight = 1;
    if (!Number.isFinite(maxBottom) || maxBottom <= 0) maxBottom = 1;

    result.mergedBoxes = merged;
    result.focusBox = keyBox ? { x: keyBox.x, y: keyBox.y, width: keyBox.width, height: keyBox.height } : null;
    result.allBoxes = boxes.map(({ x, y, width, height, page }) => ({ x, y, width, height, page } as any));
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

          if (!result.success) {
            throw new Error(result.error || 'Failed to fetch PDF');
          }
          if (!result.data) {
            throw new Error('No PDF data returned from backend');
          }

          // base64 -> Uint8Array -> ArrayBuffer (create a copy to avoid detachment)
          const binaryString = atob(result.data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          // Create a new ArrayBuffer copy to prevent detachment issues
          const arrayBuffer = bytes.buffer.slice(0);
          
          // Store as a new Uint8Array to ensure buffer stays attached
          const safeCopy = new Uint8Array(arrayBuffer);
          setPdfArrayBuffer(safeCopy.buffer);

          if (bytes.byteLength === 0) {
            throw new Error('PDF data buffer is empty (0 bytes)');
          }

          // Remove duplicate buffer assignment to prevent detachment errors
          // setPdfArrayBuffer(arrayBuffer);

          setIsLoading(false);
          if (onLoad) onLoad();
        })
        .catch((err: any) => {
          console.error('PDFViewer: PDF fetch error:', err);
          setError(`Failed to load PDF: ${err.message}`);
          setIsLoading(false);
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

        // If fit-to-width is opted in, do it once; otherwise render at current zoom (100%)
        if (fitToWidthInitially && !didFitToWidthRef.current && containerRef.current && baseViewport.width) {
          const containerWidth = containerRef.current.clientWidth;
          const targetScale = containerWidth / baseViewport.width;
          setZoom(clampZoom(targetScale));
          didFitToWidthRef.current = true;
        } else {
          renderPage(zoom);
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error('PDFViewer: Failed to load cached PDF/page', e);
          setError(`Failed to render PDF: ${e?.message || e}`);
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
      // Debug shortcuts
      if (e.key.toLowerCase() === 'd') {
        setDebugMode((v) => !v);
      }
      if (e.shiftKey && e.key.toLowerCase() === 'i') {
        setInvertY((v) => !v);
        console.log('PDFViewer: invertY set to', !invertY);
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
  }, [invertY, currentPage, totalPages, zoom]); // extend deps for nav

  // Keep hover-centering but do NOT auto-zoom when a box is highlighted
  useEffect(() => {
    if (!highlightBox || !containerRef.current) return;

    const maybeSwitchPageAndCenter = async () => {
      const targetPage = (highlightBox as any).page as number | undefined;

      if (typeof targetPage === 'number' && pdfDocRef.current && targetPage !== currentPage) {
        try {
          const page = await pdfDocRef.current.getPage(targetPage);
          pageRef.current = page;
          const base = page.getViewport({ scale: 1 });
          baseViewportRef.current = { width: base.width, height: base.height };
          setCurrentPage(targetPage);
          await renderPage(zoom);
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

      const pxBox = toPxBox(highlightBox as WideBox);
      // Center on the highlight at the current zoom, but don't change zoom automatically
      const boxCenterX = pxBox.x + pxBox.width / 2;
      const boxCenterY = pxBox.y + pxBox.height / 2;
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
    <div className="relative h-full bg-background">
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

        {/* Add: Page navigation controls */}
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

        {/* Debug + Invert Y toggles */}
        <Button
          variant="outline"
          size="sm"
          className="ml-2 h-8 px-2 rounded-full"
          onClick={() => setDebugMode((v) => !v)}
          title="Toggle debug overlays (D)"
        >
          {debugMode ? 'Debug: On' : 'Debug: Off'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2 rounded-full"
          onClick={() => setInvertY((v) => !v)}
          title="Invert Y axis (Shift+I)"
        >
          Y:{invertY ? '↓' : '↑'}
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
          {allBoxes.length > 0 && canvasSize.width > 0 && canvasSize.height > 0 && (
            <>
              {allBoxes.map((box, idx) => {
                const bb = toPxBox(box as any);
                const pad = 2;
                // Optional: only render when debugMode OR always – we keep them always visible for now
                if (debugMode) {
                  console.debug('PDFViewer: box', idx, { bb, zoom, canvasSize });
                }
                return (
                  <div
                    key={idx}
                    className="absolute pointer-events-none rounded-sm"
                    style={{
                      left: `${(bb.x - pad) * zoom}px`,
                      top: `${(bb.y - pad) * zoom}px`,
                      width: `${(bb.width + pad * 2) * zoom}px`,
                      height: `${(bb.height + pad * 2) * zoom}px`,
                      // Lighter visuals so overlaps don't flood the page
                      boxShadow: "0 0 0 1px rgba(59,130,246,0.8), 0 0 0 6px rgba(59,130,246,0.18)",
                      background: "rgba(59,130,246,0.05)",
                      zIndex: 10,
                    }}
                  />
                );
              })}
            </>
          )}

          {/* Hover highlight overlay (normalized to base pixels) */}
          {highlightBox && (() => {
            const hb = toPxBox(highlightBox as WideBox);
            const pad = 8; // increase padding for clearer highlight
            const label = `x:${Math.round(hb.x)}, y:${Math.round(hb.y)}, w:${Math.round(hb.width)}, h:${Math.round(hb.height)}${(highlightBox as any).page ? `, p:${(highlightBox as any).page}` : ""}`;
            return (
              <>
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute pointer-events-none rounded-md z-50"
                  style={{
                    left: `${(hb.x - pad) * zoom}px`,
                    top: `${(hb.y - pad) * zoom}px`,
                    width: `${(hb.width + pad * 2) * zoom}px`,
                    height: `${(hb.height + pad * 2) * zoom}px`,
                    // Stronger, clearer highlight above the PDF
                    boxShadow: "0 0 0 4px rgba(59,130,246,1), 0 0 0 8px rgba(59,130,246,0.35)",
                    background: "radial-gradient(60% 60% at 50% 50%, rgba(59,130,246,0.3), transparent)",
                    filter: "drop-shadow(0 10px 28px rgba(0,0,0,0.30))",
                    willChange: "transform, opacity",
                  }}
                />
                {/* Tooltip label with bounding box values */}
                <div
                  className="absolute z-[60] pointer-events-none px-2 py-1 rounded-md text-[10px] font-medium bg-background/85 border shadow-sm"
                  style={{
                    left: `${(hb.x - pad) * zoom}px`,
                    top: `${(hb.y - pad - 22) * zoom}px`,
                    transform: "translateY(-4px)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}