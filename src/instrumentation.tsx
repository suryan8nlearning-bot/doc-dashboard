import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Dialog } from "@radix-ui/react-dialog";
import { ChevronDown, ExternalLink } from "lucide-react";
import React, { useEffect, useState } from "react";

type SyncError = {
  error: string;
  stack: string;
  filename: string;
  lineno: number;
  colno: number;
};

type AsyncError = {
  error: string;
  stack: string;
};

type GenericError = SyncError | AsyncError;

async function reportErrorToVly(errorData: {
  error: string;
  stackTrace?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
}) {
  if (!import.meta.env.VITE_VLY_APP_ID) {
    return;
  }

  try {
    await fetch(import.meta.env.VITE_VLY_MONITORING_URL, {
      method: "POST",
      body: JSON.stringify({
        ...errorData,
        url: window.location.href,
        projectSemanticIdentifier: import.meta.env.VITE_VLY_APP_ID,
      }),
    });
  } catch (error) {
    console.error("Failed to report error to Vly:", error);
  }
}

/**
 * Global hover linking between SAP pane, Document fields, and PDF viewer.
 * Any element containing a bbox-like data attribute will emit shared events:
 *  - "doc-hover-bbox" on hover/focus
 *  - "doc-hover-clear" on leave/blur
 * Also mirrors to legacy "pdf:highlightHover"/"pdf:highlightClear".
 */
declare global {
  interface Window {
    __hoverLinkSetup?: boolean;
  }
}

if (typeof window !== "undefined" && !window.__hoverLinkSetup) {
  window.__hoverLinkSetup = true;

  const attrSelectors =
    '[data-bbox],[data-sap-bbox],[data-doc-bbox],[data-pdf-bbox],[data-bounds],[data-rect],[data-bbox-left]';

  const parseBBox = (el: Element | null): any | null => {
    if (!el) return null;

    // Try JSON-shaped attributes first
    const jsonAttrs: Array<string> = [
      "data-bbox",
      "data-sap-bbox",
      "data-doc-bbox",
      "data-pdf-bbox",
      "data-bounds",
      "data-rect",
    ];
    for (const name of jsonAttrs) {
      const raw = el.getAttribute(name);
      if (raw) {
        try {
          return JSON.parse(raw);
        } catch {
          // ignore and keep trying
        }
      }
    }

    // Fallback: discrete numeric attributes
    const left = el.getAttribute("data-bbox-left");
    const top = el.getAttribute("data-bbox-top");
    const width = el.getAttribute("data-bbox-width");
    const height = el.getAttribute("data-bbox-height");
    const page = el.getAttribute("data-bbox-page");
    if (left && top && width && height) {
      return {
        page: page ? Number(page) : undefined,
        left: Number(left),
        top: Number(top),
        width: Number(width),
        height: Number(height),
      };
    }
    return null;
  };

  const onOver = (evt: Event) => {
    const target = evt.target as Element | null;
    if (!target) return;
    const source = target.closest(attrSelectors) as Element | null;
    const bbox = parseBBox(source);
    if (!bbox) return;

    const detail = { bbox, sourceEl: source } as any;
    window.dispatchEvent(new CustomEvent("doc-hover-bbox", { detail }));
    window.dispatchEvent(new CustomEvent("pdf:highlightHover", { detail }));
  };

  const onOut = () => {
    window.dispatchEvent(new CustomEvent("doc-hover-clear"));
    window.dispatchEvent(new CustomEvent("pdf:highlightClear"));
  };

  // Use capture phase so deeply nested table/cell content is handled without per-cell handlers
  document.addEventListener("mouseover", onOver, true);
  document.addEventListener("focusin", onOver, true);
  document.addEventListener("mouseout", onOut, true);
  document.addEventListener("focusout", onOut, true);
}

function ErrorDialog({
  error,
  setError,
}: {
  error: GenericError;
  setError: (error: GenericError | null) => void;
}) {
  return (
    <Dialog
      defaultOpen={true}
      onOpenChange={() => {
        setError(null);
      }}
    >
      <DialogContent className="bg-red-700 text-white max-w-4xl">
        <DialogHeader>
          <DialogTitle>Runtime Error</DialogTitle>
        </DialogHeader>
        A runtime error occurred. Open the vly editor to automatically debug the
        error.
        <div className="mt-4">
          <Collapsible>
            <CollapsibleTrigger>
              <div className="flex items-center font-bold cursor-pointer">
                See error details <ChevronDown />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="max-w-[460px]">
              <div className="mt-2 p-3 bg-neutral-800 rounded text-white text-sm overflow-x-auto max-h-60 max-w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <pre className="whitespace-pre">{error.stack}</pre>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
        <DialogFooter>
          <a
            href={`https://vly.ai/project/${import.meta.env.VITE_VLY_APP_ID}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button>
              <ExternalLink /> Open editor
            </Button>
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ErrorBoundaryState = {
  hasError: boolean;
  error: GenericError | null;
};

class ErrorBoundary extends React.Component<
  {
    children: React.ReactNode;
  },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError() {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // logErrorToMyService(
    //   error,
    //   // Example "componentStack":
    //   //   in ComponentThatThrows (created by App)
    //   //   in ErrorBoundary (created by App)
    //   //   in div (created by App)
    //   //   in App
    //   info.componentStack,
    //   // Warning: `captureOwnerStack` is not available in production.
    //   React.captureOwnerStack(),
    // );
    reportErrorToVly({
      error: error.message,
      stackTrace: error.stack,
    });
    this.setState({
      hasError: true,
      error: {
        error: error.message,
        stack: info.componentStack ?? error.stack ?? "",
      },
    });
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <ErrorDialog
          error={{
            error: "An error occurred",
            stack: "",
          }}
          setError={() => {}}
        />
      );
    }

    return this.props.children;
  }
}

export function InstrumentationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [error, setError] = useState<GenericError | null>(null);

  useEffect(() => {
    const handleError = async (event: ErrorEvent) => {
      try {
        console.log(event);
        event.preventDefault();
        setError({
          error: event.message,
          stack: event.error?.stack || "",
          filename: event.filename || "",
          lineno: event.lineno,
          colno: event.colno,
        });

        if (import.meta.env.VITE_VLY_APP_ID) {
          await reportErrorToVly({
            error: event.message,
            stackTrace: event.error?.stack,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
          });
        }
      } catch (error) {
        console.error("Error in handleError:", error);
      }
    };

    const handleRejection = async (event: PromiseRejectionEvent) => {
      try {
        console.error(event);

        if (import.meta.env.VITE_VLY_APP_ID) {
          await reportErrorToVly({
            error: event.reason.message,
            stackTrace: event.reason.stack,
          });
        }

        setError({
          error: event.reason.message,
          stack: event.reason.stack,
        });
      } catch (error) {
        console.error("Error in handleRejection:", error);
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);
  return (
    <>
      <ErrorBoundary>{children}</ErrorBoundary>
      {error && <ErrorDialog error={error} setError={setError} />}
    </>
  );
}