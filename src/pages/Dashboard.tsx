import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/use-auth';
import { supabase, hasSupabaseEnv, publicUrlForPath } from '@/lib/supabase';
import { motion } from 'framer-motion';
import { FileText, Loader2, LogOut, Mail, Trash2, User, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function Dashboard() {
  const { isLoading: authLoading, isAuthenticated, user, signOut } = useAuth();
  const navigate = useNavigate();

  type DashboardDoc = {
    id: string;
    created_at: string;
    pdf_url: string;
    status?: string;
    title?: string;
    document_data?: any;
    from_email?: string;
    cc_emails?: string[];
    subject?: string;
    bucket_name?: string;
    mail_content?: string;
    raw?: any;
  };

  const [documents, setDocuments] = useState<DashboardDoc[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedMailContent, setSelectedMailContent] = useState<string | null>(null);
  const [isMailDialogOpen, setIsMailDialogOpen] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/auth');
    }
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (isAuthenticated) {
      if (hasSupabaseEnv) {
        fetchDocuments();
      } else {
        setIsLoadingDocs(false);
        toast.error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in API keys tab.');
      }
    }
  }, [isAuthenticated]);

  const coerceDocumentData = (row: any) => {
    const candidates = [
      row?.document_data,
      row?.data,
      row?.json,
      row?.payload,
      row?.['Document Data'],
      row?.['document_data'],
      row?.['Data'],
    ];
    for (const cand of candidates) {
      try {
        const obj = typeof cand === 'string' ? JSON.parse(cand) : cand;
        if (obj?.document?.pages && Array.isArray(obj.document.pages) && obj.document.pages.length > 0) {
          return obj;
        }
      } catch {
        // ignore parse errors
      }
    }
    return undefined;
  };

  const parseEmailField = (field: any): string => {
    if (!field) return '';
    if (typeof field === 'string') return field;
    if (Array.isArray(field) && field.length > 0) {
      const first = field[0];
      if (typeof first === 'string') return first;
      if (first?.value) return first.value;
      if (first?.address) return first.address;
      if (first?.email) return first.email;
    }
    if (field.value) return field.value;
    if (field.address) return field.address;
    if (field.email) return field.email;
    return '';
  };

  const parseCCEmails = (field: any): string[] => {
    if (!field) return [];
    if (Array.isArray(field)) {
      return field.map((item: any) => {
        if (typeof item === 'string') return item;
        if (item?.value) return item.value;
        if (item?.address) return item.address;
        if (item?.email) return item.email;
        return '';
      }).filter(Boolean);
    }
    if (typeof field === 'string') {
      return field.split(',').map(s => s.trim()).filter(Boolean);
    }
    // Handle object with nested properties
    if (typeof field === 'object' && field !== null) {
      if (field.value) return [field.value];
      if (field.address) return [field.address];
      if (field.email) return [field.email];
    }
    return [];
  };

  const fetchDocuments = async () => {
    try {
      setIsLoadingDocs(true);
      const { data, error } = await supabase
        .from('N8N Logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      const mapped: DashboardDoc[] = (data as any[] | null || []).map((row: any, idx: number) => {
        const path = row?.['Bucket Name'] ?? row?.bucket_name ?? row?.path ?? '';
        const pdf_url = path ? publicUrlForPath(path) : '';
        const status = row?.status ?? row?.Status ?? row?.state ?? row?.State;
        const created_at = row?.created_at ?? row?.createdAt ?? row?.timestamp ?? new Date().toISOString();
        const id = String(row?.id ?? row?.uuid ?? row?._id ?? `${created_at}-${idx}`);
        const document_data = coerceDocumentData(row);
        const title =
          document_data?.document?.pages?.[0]?.metadata?.document_title?.value ||
          (typeof row?.title === 'string' ? row.title : undefined) ||
          (typeof path === 'string' ? String(path).split('/').pop() : undefined) ||
          'Untitled Document';
        
        const from_email = parseEmailField(row?.from ?? row?.From ?? row?.from_email ?? row?.sender ?? row?.['From Email']);
        
        // Enhanced CC parsing with more field variations
        const cc_emails = parseCCEmails(
          row?.cc ?? 
          row?.CC ?? 
          row?.cc_emails ?? 
          row?.['CC Emails'] ?? 
          row?.['Cc Emails'] ??
          row?.ccEmails ??
          row?.recipients ?? 
          row?.Recipients ?? 
          row?.to ?? 
          row?.To ??
          row?.['To Emails']
        );
        
        // Enhanced subject parsing with more field variations and better handling
        let subject = '';
        const subjectCandidates = [
          row?.subject,
          row?.Subject,
          row?.title,
          row?.Title,
          row?.email_subject,
          row?.['Email Subject'],
          row?.mail_subject,
          row?.['Mail Subject'],
          row?.emailSubject
        ];
        
        for (const candidate of subjectCandidates) {
          if (candidate) {
            if (typeof candidate === 'string') {
              subject = candidate;
              break;
            } else if (candidate?.value) {
              subject = candidate.value;
              break;
            }
          }
        }
        
        // Strip HTML tags and trim
        subject = subject.replace(/<[^>]*>/g, '').trim();
        
        const bucket_name = row?.['Bucket Name'] ?? row?.bucket_name ?? '';
        
        // Enhanced mail content parsing with more field variations
        const mail_content = 
          row?.mail_content ?? 
          row?.['Mail Content'] ?? 
          row?.['mail content'] ?? 
          row?.mailContent ?? 
          row?.html ?? 
          row?.HTML ?? 
          row?.body ?? 
          row?.Body ?? 
          row?.content ?? 
          row?.Content ?? 
          row?.message ?? 
          row?.Message ?? 
          row?.text ?? 
          row?.Text ??
          row?.email_body ??
          row?.['Email Body'] ??
          row?.emailBody ??
          '';

        return {
          id,
          created_at: String(created_at),
          pdf_url,
          status: status ? String(status) : undefined,
          document_data,
          raw: row,
          title,
          from_email,
          cc_emails,
          subject,
          bucket_name,
          mail_content,
        };
      });

      setDocuments(mapped);
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast.error(`Failed to load documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  const handleViewMailContent = (content: string) => {
    setSelectedMailContent(content);
    setIsMailDialogOpen(true);
  };

  const handleSelectDocument = (docId: string) => {
    setSelectedDocuments((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedDocuments.size === filteredDocs.length) {
      setSelectedDocuments(new Set());
    } else {
      setSelectedDocuments(new Set(filteredDocs.map((d) => d.id)));
    }
  };

  const truncateText = (text: string, maxLength: number = 50) => {
    if (!text) return '—';
    const stripped = text.replace(/<[^>]*>/g, '');
    return stripped.length > maxLength ? stripped.substring(0, maxLength) + '...' : stripped;
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const uniqueStatuses = Array.from(
    new Set(documents.map((d) => (d.status ?? '').trim()).filter((s) => s.length > 0))
  );
  const filteredDocs =
    statusFilter === 'ALL'
      ? documents
      : documents.filter((d) => (d.status ?? '').toLowerCase() === statusFilter.toLowerCase());

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between px-8 py-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo.svg"
              alt="Logo"
              className="h-8 w-8 cursor-pointer"
              onClick={() => navigate('/')}
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
                    <p className="text-sm font-medium leading-none">{user?.email || 'User'}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer">
                  <User className="h-4 w-4 mr-2" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggleDarkMode} className="cursor-pointer">
                  {isDarkMode ? (
                    <Sun className="h-4 w-4 mr-2" />
                  ) : (
                    <Moon className="h-4 w-4 mr-2" />
                  )}
                  Dark Mode
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-red-600">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 p-8 overflow-auto">
        <div className="max-w-full mx-auto">
          <div className="mb-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold tracking-tight">Documents</h2>
              {uniqueStatuses.length > 0 && (
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Statuses</SelectItem>
                    {uniqueStatuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {selectedDocuments.size > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 p-4 bg-muted rounded-lg"
              >
                <span className="text-sm font-medium">
                  {selectedDocuments.size} document{selectedDocuments.size !== 1 ? 's' : ''} selected
                </span>
                <Button
                  variant="default"
                  size="sm"
                  onClick={async () => {
                    try {
                      const selectedIds = Array.from(selectedDocuments);
                      const webhookUrl = import.meta.env.VITE_WEBHOOK_URL || 'https://your-webhook-url.com/endpoint';
                      
                      const response = await fetch(webhookUrl, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          documentIds: selectedIds,
                          timestamp: new Date().toISOString(),
                        }),
                      });

                      if (response.ok) {
                        toast.success(`Successfully sent ${selectedIds.length} document(s) to webhook`);
                        setSelectedDocuments(new Set());
                      } else {
                        throw new Error(`Webhook returned status ${response.status}`);
                      }
                    } catch (error) {
                      console.error('Webhook error:', error);
                      toast.error(`Failed to send to webhook: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    }
                  }}
                >
                  Create
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    toast.success(`${selectedDocuments.size} documents would be deleted`);
                    setSelectedDocuments(new Set());
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Selected
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedDocuments(new Set())}
                >
                  Clear Selection
                </Button>
              </motion.div>
            )}
          </div>

          {!hasSupabaseEnv ? (
            <div className="text-center py-12 space-y-4">
              <FileText className="h-16 w-16 mx-auto text-muted-foreground opacity-20" />
              <div className="text-lg font-medium">Supabase is not configured</div>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Add SUPABASE_URL and SUPABASE_ANON_KEY in the Integrations tab, then refresh.
              </p>
            </div>
          ) : isLoadingDocs ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <FileText className="h-16 w-16 mx-auto text-muted-foreground opacity-20" />
              <div className="text-lg font-medium">No documents found</div>
              <p className="text-sm text-muted-foreground">
                {statusFilter !== 'ALL' ? 'Try changing the status filter' : 'Documents will appear here once added'}
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedDocuments.size === filteredDocs.length && filteredDocs.length > 0}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all documents"
                      />
                    </TableHead>
                    <TableHead className="w-24">ID</TableHead>
                    <TableHead className="min-w-[180px]">From</TableHead>
                    <TableHead className="min-w-[180px]">CC</TableHead>
                    <TableHead className="min-w-[200px]">Subject</TableHead>
                    <TableHead className="min-w-[150px]">PDF Name</TableHead>
                    <TableHead className="min-w-[200px]">Mail Content</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocs.map((doc) => (
                    <TableRow 
                      key={doc.id}
                      className={selectedDocuments.has(doc.id) ? 'bg-muted/50' : ''}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedDocuments.has(doc.id)}
                          onCheckedChange={() => handleSelectDocument(doc.id)}
                          aria-label={`Select document ${doc.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{doc.id}</TableCell>
                      <TableCell>
                        <div className="max-w-[180px] truncate" title={doc.from_email || '—'}>
                          {doc.from_email || '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {doc.cc_emails && doc.cc_emails.length > 0 ? (
                          <div className="text-xs max-w-[180px]">
                            <div className="truncate" title={doc.cc_emails.join(', ')}>
                              {doc.cc_emails.slice(0, 2).join(', ')}
                            </div>
                            {doc.cc_emails.length > 2 && (
                              <span className="text-muted-foreground">
                                +{doc.cc_emails.length - 2} more
                              </span>
                            )}
                          </div>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px] truncate" title={doc.subject || '—'}>
                          {doc.subject || '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[150px] truncate" title={doc.bucket_name || '—'}>
                          {doc.bucket_name || '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {doc.mail_content ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground max-w-[150px] truncate">
                              {truncateText(doc.mail_content, 30)}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewMailContent(doc.mail_content!)}
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/document/${doc.id}`)}
                        >
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Mail Content Dialog */}
      <Dialog open={isMailDialogOpen} onOpenChange={setIsMailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Content</DialogTitle>
            <DialogDescription>Full email message content</DialogDescription>
          </DialogHeader>
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: selectedMailContent || '' }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}