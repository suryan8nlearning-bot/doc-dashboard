import { motion } from 'framer-motion';
import { ZoomIn, ZoomOut } from 'lucide-react';
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

  return (
    <div className="relative h-full flex flex-col bg-muted/30">
      <div className="flex items-center justify-between p-4 border-b bg-background">
        <h3 className="font-semibold text-sm">Document Preview</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="flex items-center px-3 text-sm font-medium">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={handleZoomIn}
            disabled={zoom >= 3}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-auto relative"
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
