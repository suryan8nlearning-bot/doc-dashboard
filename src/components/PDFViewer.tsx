import { motion } from 'framer-motion';
import { ZoomIn, ZoomOut, RotateCcw, Loader2, ArrowUp } from 'lucide-react';
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
}

export function PDFViewer({ pdfUrl, highlightBox, onLoad, documentData }: PDFViewerProps) {
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

  const fetchPdfProxy = useAction(api.documents.fetchPdfProxy);

  // Tighten and extend zoom bounds + guard
  const clampZoom = (value: number) => {
    const next = Number.isFinite(value) ? value : 1;
    return Math.max(0.25, Math.min(next, 4));
  };

  // Helper: update zoom and keep the visual center stable while scrolling
  const updateZoom = (nextZoom: number) => {
    const container = containerRef.current;
    if (!container) {
      setZoom(clampZoom(nextZoom));
      return;
    }
    const prevZoom = zoom;
    const targetZoom = clampZoom(nextZoom);

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

    // Trigger a brief HUD to show zoom level
    setShowZoomHud(true);
    setTimeout(() => setShowZoomHud(false), 450);
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
  const { mergedBoxes, focusBox, allBoxes } = useMemo(() => {
    const result = { 
      mergedBoxes: [] as BoundingBox[], 
      focusBox: null as BoundingBox | null,
      allBoxes: [] as BoundingBox[],
    };
    if (!documentData?.document?.pages?.length) return result;

    const page = documentData.document.pages[0];
    const boxes: Array<BoundingBox & { label?: string }> = [];

    const pushField = (label: string, field?: { value?: string; bounding_box?: BoundingBox[] }) => {
      if (!field?.bounding_box?.length) return;
      field.bounding_box.forEach((b) => boxes.push({ ...b, label }));
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
          item.bounding_box.forEach((b: any) => boxes.push({ ...b, label: `Item ${idx + 1}` }));
        }
      });
    }

    // NEW: Recursively collect any bounding_box arrays anywhere on the page object
    const collectBoxes = (node: any) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(collectBoxes);
        return;
      }
      if (typeof node === 'object') {
        if (Array.isArray(node.bounding_box)) {
          node.bounding_box.forEach((b: any) => {
            if (b && typeof b.x === 'number' && typeof b.y === 'number') {
              boxes.push({ x: b.x, y: b.y, width: b.width, height: b.height });
            }
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
      boxes.find((b) => b.label && keyLabels.test(b.label)) ||
      null;

    result.mergedBoxes = merged;
    result.focusBox = keyBox ? { x: keyBox.x, y: keyBox.y, width: keyBox.width, height: keyBox.height } : null;
    result.allBoxes = boxes.map(({ x, y, width, height }) => ({ x, y, width, height }));
    return result;
  }, [documentData]);

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

        const page = await pdf.getPage(1);
        if (cancelled) return;
        pageRef.current = page;

        const baseViewport = page.getViewport({ scale: 1 });
        baseViewportRef.current = { width: baseViewport.width, height: baseViewport.height };

        // If fit-to-width hasn't happened yet, attempt it now for a great first paint
        if (!didFitToWidthRef.current && containerRef.current && baseViewport.width) {
          const containerWidth = containerRef.current.clientWidth;
          const targetScale = containerWidth / baseViewport.width;
          setZoom(clampZoom(targetScale));
          didFitToWidthRef.current = true;
        } else {
          // Render at current zoom immediately
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
  }, [pdfArrayBuffer]);

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

  // Fit PDF to container width once using cached page metrics
  useEffect(() => {
    if (!containerRef.current || didFitToWidthRef.current) return;
    const base = baseViewportRef.current;
    if (!base) return;
    const containerWidth = containerRef.current.clientWidth;
    const targetScale = containerWidth && base.width ? containerWidth / base.width : 1;
    setZoom(clampZoom(targetScale));
    didFitToWidthRef.current = true;
  }, [pdfArrayBuffer]);

  // Auto-focus/zoom into key region once after load if focusBox exists
  useEffect(() => {
    if (didAutoFocusRef.current) return;
    if (!focusBox || !containerRef.current || !pdfArrayBuffer) return;

    didAutoFocusRef.current = true;
    const container = containerRef.current;
    const desiredZoom = clampZoom(Math.max(
      zoom,
      (container.clientWidth * 0.6) / Math.max(focusBox.width, 1),
    ));
    setZoom(desiredZoom);
    setTimeout(() => {
      const cx = focusBox.x + focusBox.width / 2;
      const cy = focusBox.y + focusBox.height / 2;
      container.scrollTo({
        left: cx * desiredZoom - container.clientWidth / 2,
        top: cy * desiredZoom - container.clientHeight / 2,
        behavior: 'smooth',
      });
    }, 180);
  }, [focusBox, pdfArrayBuffer]);

  const handleZoomIn = () => {
    updateZoom(zoom + 0.5);
  };
  
  const handleZoomOut = () => {
    updateZoom(zoom - 0.5);
  };
  
  const handleResetZoom = () => {
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
        setZoom((prev) => clampZoom(prev + 0.25));
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setZoom((prev) => clampZoom(prev - 0.25));
      }
      if (e.key === '0') {
        e.preventDefault();
        handleResetZoom();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Keep hover-centering and zooming for a hovered single box (clamped)
  useEffect(() => {
    if (highlightBox && containerRef.current) {
      const container = containerRef.current;
      const targetZoom = clampZoom(Math.max(
        zoom,
        (container.clientWidth * 0.55) / Math.max(highlightBox.width, 1),
      ));
      if (targetZoom > zoom + 0.01) {
        setZoom(targetZoom);
      }
      const boxCenterX = highlightBox.x + highlightBox.width / 2;
      const boxCenterY = highlightBox.y + highlightBox.height / 2;
      container.scrollTo({
        left: boxCenterX * targetZoom - container.clientWidth / 2,
        top: boxCenterY * targetZoom - container.clientHeight / 2,
        behavior: 'smooth',
      });
    }
  }, [highlightBox, zoom]);

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
        className="h-full overflow-auto relative"
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
          />

          {/* Subtle overlays for all boxes - switch to explicit RGBA so they're always visible */}
          {allBoxes.map((box, idx) => (
            <motion.div
              key={`all-${idx}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.35 }}
              exit={{ opacity: 0 }}
              className="absolute rounded-sm pointer-events-none"
              style={{
                left: `${box.x * zoom}px`,
                top: `${box.y * zoom}px`,
                width: `${box.width * zoom}px`,
                height: `${box.height * zoom}px`,
                boxShadow: '0 0 0 1px rgba(59,130,246,0.45)',       // tailwind blue-500 @ ~45%
                background: 'linear-gradient(135deg, rgba(59,130,246,0.18), transparent)',
              }}
            />
          ))}

          {/* Hover highlight overlay - thicker stroke and pleasing glow */}
          {highlightBox && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute pointer-events-none rounded-md"
              style={{
                left: `${highlightBox.x * zoom}px`,
                top: `${highlightBox.y * zoom}px`,
                width: `${highlightBox.width * zoom}px`,
                height: `${highlightBox.height * zoom}px`,
                boxShadow: '0 0 0 3px rgba(59,130,246,0.9)',
                background: 'radial-gradient(60% 60% at 50% 50%, rgba(59,130,246,0.3), transparent)',
                filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.25))',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}