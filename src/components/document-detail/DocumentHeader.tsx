import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, FileText, Loader2, User } from 'lucide-react';
import { useNavigate } from 'react-router';

interface DocumentHeaderProps {
  // Make title optional to accept undefined and avoid TS2322 in callers
  title?: string;
  status?: string;
  userEmail?: string;
  showSAP: boolean;
  onToggleSAP: (value: boolean) => void;
  onSignOut: () => Promise<void>;
  isSaving: boolean;
  isCreating: boolean;
  canSave: boolean;
  canCreate: boolean;
  onSave: () => void;
  onCreate: () => void;
  onOpenDebug: () => void;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  navLoading: null | 'prev' | 'next';
  onPrev: () => void;
  onNext: () => void;
}

export function DocumentHeader({
  title,
  status,
  userEmail,
  showSAP,
  onToggleSAP,
  onSignOut,
  isSaving,
  isCreating,
  canSave,
  canCreate,
  onSave,
  onCreate,
  onOpenDebug,
  isExpanded,
  onToggleExpanded,
  navLoading,
  onPrev,
  onNext,
}: DocumentHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="border-b bg-background sticky top-0 z-10">
      <div className="flex items-center justify-between px-8 py-4">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/')}
            className="px-4 rounded-md"
            aria-label="Back to Dashboard"
            title="Back to Dashboard"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Dashboard
          </Button>

          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div>
              <h1 className="text-lg font-semibold">{title ?? 'Document'}</h1>
              {status && <span className="text-xs text-muted-foreground">{status}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleExpanded}
            className="px-4 rounded-md"
          >
            {isExpanded ? 'Split View' : 'Full Page'}
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={onSave}
            disabled={!canSave || isSaving}
            className="px-4 rounded-md"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={onCreate}
            disabled={!canCreate || isCreating}
            className="px-4 rounded-md"
          >
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Create
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onPrev}
              disabled={navLoading !== null}
              className="px-4"
            >
              {navLoading === 'prev' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading...
                </>
              ) : (
                'Previous'
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onNext}
              disabled={navLoading !== null}
              className="px-4"
            >
              {navLoading === 'next' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading...
                </>
              ) : (
                'Next'
              )}
            </Button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full h-9 w-9 bg-primary/10 hover:bg-primary/20"
                aria-label="User menu"
              >
                <User className="h-4 w-4 text-primary" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-xs text-muted-foreground">Signed in as</p>
                  <p className="text-sm font-medium leading-none">{userEmail || 'User'}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer">
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/')} className="cursor-pointer">
                Dashboard
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                className="cursor-default flex items-center justify-between"
              >
                <span>Show SAP Data</span>
                <Switch
                  checked={showSAP}
                  onCheckedChange={onToggleSAP}
                  aria-label="Toggle SAP Data"
                />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await onSignOut();
                  navigate('/');
                }}
                className="cursor-pointer text-red-600"
              >
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenDebug}
            className="px-3"
            title="Open debug logs"
          >
            Logs
          </Button>
        </div>
      </div>
    </header>
  );
}