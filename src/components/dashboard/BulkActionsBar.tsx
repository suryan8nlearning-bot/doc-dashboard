import { Button } from "@/components/ui/button";
import { Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

type BulkActionsBarProps = {
  selectedIds: string[];
  userEmail?: string;
  onProfile: () => void;
  onClearSelection: () => void;
};

export function BulkActionsBar({
  selectedIds,
  userEmail = "anonymous",
  onProfile,
  onClearSelection,
}: BulkActionsBarProps) {
  const sendWebhook = useAction(api.webhooks.sendWebhook);

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-background/50 backdrop-blur-md shadow-lg">
      <span className="text-sm font-medium">
        {selectedIds.length} document{selectedIds.length !== 1 ? "s" : ""} selected
      </span>

      <Button
        variant="default"
        size="sm"
        className="bg-gradient-to-r from-primary to-fuchsia-600 text-white shadow-sm hover:opacity-90 transition"
        onClick={async () => {
          const rawUrl = import.meta.env.VITE_WEBHOOK_URL as string | undefined;

          if (!rawUrl) {
            toast.error(
              "Webhook URL not configured. Set VITE_WEBHOOK_URL in API keys (Integrations tab) and refresh."
            );
            return;
          }

          try {
            const res = await sendWebhook({
              url: rawUrl,
              body: { documentIds: selectedIds },
              userEmail,
              source: "dashboard",
            });

            if (res?.ok) {
              toast.success(`Successfully sent ${selectedIds.length} document(s)`);
              onClearSelection();
            } else {
              toast.error(`Failed to send: ${res?.error || "Unknown error"}`);
            }
          } catch (error) {
            toast.error(
              `Failed to send: ${error instanceof Error ? error.message : "Unknown error"}`
            );
          }
        }}
      >
        Create
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="bg-background/60 backdrop-blur border hover:bg-background/80 transition"
        onClick={onProfile}
      >
        <User className="h-4 w-4 mr-2" />
        Profile
      </Button>

      <Button
        variant="destructive"
        size="sm"
        onClick={() => {
          toast.success(`${selectedIds.length} documents would be deleted`);
          onClearSelection();
        }}
      >
        <Trash2 className="h-4 w-4 mr-2" />
        Delete Selected
      </Button>

      <Button variant="outline" size="sm" onClick={onClearSelection}>
        Clear Selection
      </Button>
    </div>
  );
}
