import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Trash2, User } from "lucide-react";

type Props = {
  selectedCount: number;
  onCreate: () => void | Promise<void>;
  onProfile: () => void;
  onDelete: () => void;
  onClear: () => void;
};

export function BulkActionsBar({
  selectedCount,
  onCreate,
  onProfile,
  onDelete,
  onClear,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-background/50 backdrop-blur-md shadow-lg"
    >
      <span className="text-sm font-medium">
        {selectedCount} document{selectedCount !== 1 ? "s" : ""} selected
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

      <Button variant="destructive" size="sm" onClick={onDelete}>
        <Trash2 className="h-4 w-4 mr-2" />
        Delete Selected
      </Button>

      <Button variant="outline" size="sm" onClick={onClear}>
        Clear Selection
      </Button>
    </motion.div>
  );
}
