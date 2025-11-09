import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

type DebugEvent = { label: string; payload: any; time: string };

interface DebugLogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: DebugEvent[];
  onClear: () => void;
}

export function DebugLogsDialog({ open, onOpenChange, events, onClear }: DebugLogsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create Debug Logs</DialogTitle>
          <DialogDescription>
            Detailed events and payloads from the last Create action.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {events.length} {events.length === 1 ? 'event' : 'events'}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(JSON.stringify(events, null, 2));
                    toast.success('Logs copied to clipboard');
                  } catch {
                    toast.error('Failed to copy logs');
                  }
                }}
              >
                Copy all
              </Button>
              <Button variant="ghost" size="sm" onClick={onClear}>
                Clear
              </Button>
            </div>
          </div>

          <ScrollArea className="h-[50vh] rounded border">
            <div className="p-3 space-y-3">
              {events.length ? (
                events.map((e, i) => (
                  <div key={i} className="rounded border bg-card/40 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{e.label}</div>
                      <div className="text-xs text-muted-foreground">{e.time}</div>
                    </div>
                    <pre className="mt-2 text-xs whitespace-pre-wrap break-all">
                      {(() => {
                        try {
                          return JSON.stringify(e.payload, null, 2);
                        } catch {
                          return String(e.payload);
                        }
                      })()}
                    </pre>
                  </div>
                ))
              ) : (
                <div className="p-6 text-sm text-muted-foreground">
                  No logs yet. Click Create to generate logs.
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
