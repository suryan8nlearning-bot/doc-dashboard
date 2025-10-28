import { motion } from 'framer-motion';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import type { BoundingBox } from '@/lib/supabase';

interface PDFViewerProps {
  pdfUrl: string;
  highlightBox: BoundingBox | null;
  onLoad?: () => void;
}

export function PDFViewer({ pdfUrl, highlightBox, onLoad }: PDFViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (onLoad) {
      const timer = setTimeout(onLoad, 1000);
      return () => clearTimeout(timer);
    }
  }, [onLoad]);

  useEffect(() => {
    if (containerRef.current) {
      setPdfDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    }
  }, []);

  useEffect(() => {
    if (highlightBox && containerRef.current) {
      const boxCenterX = highlightBox.x + highlightBox.width / 2;
      const boxCenterY = highlightBox.y + highlightBox.height / 2;
      
      containerRef.current.scrollTo({
        left: boxCenterX * zoom - containerRef.current.clientWidth / 2,
        top: boxCenterY * zoom - containerRef.current.clientHeight / 2,
        behavior: 'smooth',
      });
    }
  }, [highlightBox, zoom]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => {
    setZoom(1);
    if (containerRef.current) {
      containerRef.current.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((prev) => Math.min(prev + 0.25, 3));
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setZoom((prev) => Math.max(prev - 0.25, 0.5));
      }
      if (e.key === '0') {
        e.preventDefault();
        handleResetZoom();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="relative h-full bg-muted/30">
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1 rounded-full border bg-background/80 backdrop-blur px-2 py-1">
        <Button
          variant="outline"
          size="icon"
          className="rounded-full"
          onClick={handleZoomOut}
          disabled={zoom <= 0.5}
          aria-label="Zoom out"
          title="Zoom out (-)"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="px-3 text-sm font-medium tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="outline"
          size="icon"
          className="rounded-full"
          onClick={handleZoomIn}
          disabled={zoom >= 3}
          aria-label="Zoom in"
          title="Zoom in (+)"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="rounded-full ml-1"
          onClick={handleResetZoom}
          disabled={zoom === 1}
          aria-label="Reset zoom"
          title="Reset zoom (0)"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <div
        ref={containerRef}
        className="h-full overflow-auto relative"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div
          className="relative inline-block min-w-full"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            width: `${100 / zoom}%`,
          }}
        >
          <iframe
            ref={iframeRef}
            src={pdfUrl}
            className="w-full h-[800px] border-0"
            title="PDF Preview"
          />
          
          {highlightBox && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute border-4 border-primary bg-primary/10 pointer-events-none"
              style={{
                left: `${highlightBox.x}px`,
                top: `${highlightBox.y}px`,
                width: `${highlightBox.width}px`,
                height: `${highlightBox.height}px`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}