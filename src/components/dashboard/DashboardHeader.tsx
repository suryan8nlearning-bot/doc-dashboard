import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Moon, Sun, User } from "lucide-react";

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
    <div className="flex items-center justify-between px-8 py-4">
      <div className="flex items-center gap-3">
        <img
          src="/logo.svg"
          alt="Logo"
          className="h-8 w-8 cursor-pointer"
          onClick={onLogoClick}
        />
        <h1 className="text-xl font-bold tracking-tight">Document Dashboard</h1>
      </div>
      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full h-10 w-10 bg-primary/10 hover:bg-primary/20"
            >
              <User className="h-5 w-5 text-primary" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-xs text-muted-foreground">Signed in as</p>
                <p className="text-sm font-medium leading-none">{userEmail || "User"}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onProfile} className="cursor-pointer">
              <User className="h-4 w-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleDark} className="cursor-pointer">
              {isDarkMode ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
              Dark Mode
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onSignOut}
              className="cursor-pointer text-red-600"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
