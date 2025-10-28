import { motion } from 'framer-motion';
import { ZoomIn, ZoomOut, RotateCcw, Loader2 } from 'lucide-react';
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const objectRef = useRef<HTMLObjectElement>(null);

  useEffect(() => {
    if (pdfUrl) {
      console.log('PDF URL being loaded:', pdfUrl);
      console.log('PDF URL length:', pdfUrl.length);
      console.log('PDF URL starts with:', pdfUrl.substring(0, 50));
      setIsLoading(true);
      setError(null);
      
      // Test if the PDF URL is accessible
      fetch(pdfUrl, { method: 'HEAD', mode: 'no-cors' })
        .then(response => {
          console.log('PDF fetch response:', response.status, response.statusText, response.type);
          // With no-cors, we won't get status, so just proceed
          setIsLoading(false);
          if (onLoad) onLoad();
        })
        .catch(err => {
          console.error('PDF load error:', err);
          // Even if fetch fails, try to load the PDF anyway
          console.log('Attempting to load PDF despite fetch error');
          setIsLoading(false);
          if (onLoad) onLoad();
        });
    } else {
      console.warn('No PDF URL provided');
      setError('No PDF URL available');
      setIsLoading(false);
    }
  }, [pdfUrl, onLoad]);

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

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

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
          <object
            ref={objectRef}
            data={pdfUrl}
            type="application/pdf"
            className="w-full h-[800px] border-0"
            title="PDF Preview"
            onLoad={() => console.log('PDF object loaded successfully')}
            onError={(e) => console.error('PDF object load error:', e)}
          >
            <embed
              src={pdfUrl}
              type="application/pdf"
              className="w-full h-[800px] border-0"
              onLoad={() => console.log('PDF embed loaded successfully')}
              onError={(e) => console.error('PDF embed load error:', e)}
            />
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Your browser cannot display this PDF. Please download it to view.
              </p>
              <a 
                href={pdfUrl} 
                download 
                className="text-primary hover:underline"
              >
                Download PDF
              </a>
            </div>
          </object>
          
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