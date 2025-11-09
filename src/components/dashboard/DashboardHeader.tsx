import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Moon, Sun, User, Bell } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router";

type DashboardHeaderProps = {
  userEmail?: string;
  isDarkMode: boolean;
  onLogoClick: () => void;
  onProfile: () => void;
  onToggleDark: () => void;
  onSignOut: () => void;
};

export function DashboardHeader({
  userEmail,
  isDarkMode,
  onLogoClick,
  onProfile,
  onToggleDark,
  onSignOut,
}: DashboardHeaderProps) {
  return (
    <div className="h-16 px-6 flex items-center justify-between">
      {/* Left: Logo + Title */}
      <div className="flex items-center gap-3">
        <img
          src="/logo.svg"
          alt="Logo"
          className="h-8 w-8 cursor-pointer"
          onClick={onLogoClick}
        />
        <h1 className="text-lg font-semibold tracking-tight">Document Dashboard</h1>
      </div>

      {/* Center: Search - removed */}
      <div className="hidden" />

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={onToggleDark}
          className="rounded-full h-10 w-10 hover:bg-white/10"
        >
          {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifications"
          className="rounded-full h-10 w-10 hover:bg-white/10"
        >
          <Bell className="h-5 w-5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open profile menu"
              className="rounded-full h-10 w-10 bg-primary/10 hover:bg-primary/20"
            >
              <User className="h-5 w-5 text-primary" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent asChild align="end" className="w-64">
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-xs text-muted-foreground">Signed in as</p>
                  <p className="text-sm font-medium leading-none">
                    {userEmail || "User"}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onProfile} className="cursor-pointer" role="menuitem">
                <User className="h-4 w-4 mr-2" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleDark} className="cursor-pointer" role="menuitem">
                {isDarkMode ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
                Toggle Theme
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onSignOut}
                className="cursor-pointer text-red-600"
                role="menuitem"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </motion.div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}