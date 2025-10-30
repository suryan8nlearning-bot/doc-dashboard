import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: string;
};

export function MailDialog({ open, onOpenChange, content }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-background/60 backdrop-blur-md border border-white/10">
        <DialogHeader>
          <DialogTitle>Email Content</DialogTitle>
          <DialogDescription>Full email message content</DialogDescription>
        </DialogHeader>
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </DialogContent>
    </Dialog>
  );
}
