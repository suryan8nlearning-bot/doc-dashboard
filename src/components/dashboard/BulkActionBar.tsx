import { Button } from "@/components/ui/button";
import { Trash2, User } from "lucide-react";

type BulkActionBarProps = {
  count: number;
  onCreate: () => void | Promise<void>;
  onProfile: () => void;
  onDeleteSelected: () => void;
  onClear: () => void;
};

export function BulkActionBar({
  count,
  onCreate,
  onProfile,
  onDeleteSelected,
  onClear,
}: BulkActionBarProps) {
  return (
    <>
      <span className="text-sm font-medium">
        {count} document{count !== 1 ? "s" : ""} selected
      </span>

      <Button
        variant="default"
        size="sm"
        className="bg-gradient-to-r from-primary to-fuchsia-600 text-white shadow-sm hover:opacity-90 transition"
        onClick={onCreate}
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

      <Button variant="destructive" size="sm" onClick={onDeleteSelected}>
        <Trash2 className="h-4 w-4 mr-2" />
        Delete Selected
      </Button>

      <Button variant="outline" size="sm" onClick={onClear}>
        Clear Selection
      </Button>
    </>
  );
}
