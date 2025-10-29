import { DocumentFields } from '@/components/DocumentFields';
import { PDFViewer } from '@/components/PDFViewer';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { supabase, type BoundingBox, hasSupabaseEnv, publicUrlForPath } from '@/lib/supabase';
import { createSignedUrlForPath } from '@/lib/supabase';
import { motion } from 'framer-motion';
import { ArrowLeft, FileText, Loader2, ExternalLink, ArrowUp } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

export default function DocumentDetail() {
  const { isLoading: authLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const { documentId } = useParams<{ documentId: string }>();

  type DocumentData = {
    id: string;
    created_at: string;
    pdf_url: string;
    status?: string;
    title?: string;
    document_data?: any;
  };

  // Rename to avoid shadowing the global window.document
  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [highlightBox, setHighlightBox] = useState<(BoundingBox & { page?: number }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // SAP data viewer state
  const [showSAP, setShowSAP] = useState<boolean>(true);
  const [sapOut, setSapOut] = useState<any | null>(null);

  // Add aside ref for scroll-to-top control
  const asideRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/auth');
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Apply theme from user profile on this page
  useEffect(() => {
    if (!user?.theme) return;
    const root = document.documentElement;
    root.classList.remove('dark', 'glass-theme');
    if (user.theme === 'glass') {
      root.classList.add('glass-theme');
    } else if (user.theme === 'dark') {
      root.classList.add('dark');
    }
  }, [user?.theme]);

  useEffect(() => {
    if (isAuthenticated && documentId) {
      if (hasSupabaseEnv) {
        fetchDocument();
      } else {
        setIsLoading(false);
        toast.error('Supabase is not configured.');
      }
    }
  }, [isAuthenticated, documentId]);

  // removed editor sync effect

  // Convert new compact array-based format into the old pages-based structure our UI expects
  function convertNewFormatToOld(obj: any) {
    const toNum = (v: any) => (v === null || v === undefined || v === '' ? NaN : Number(v));

    const fromPair = (pair: any) => {
      // Accept both new [value, [x1,y1,x2,y2,p]] and old { value, bounding_box } shapes
      if (Array.isArray(pair) && pair.length >= 2 && Array.isArray(pair[1])) {
        return { value: String(pair[0] ?? ''), bounding_box: [pair[1]] };
      }
      if (pair && typeof pair === 'object' && 'value' in pair && 'bounding_box' in pair) {
        return pair;
      }
      return { value: String(pair ?? ''), bounding_box: [] };
    };

    const combineBoxes = (boxes: any[]): any[] => {
      // Combine multiple [x1,y1,x2,y2,p] into a single encompassing box
      const coords = boxes
        .filter((b) => Array.isArray(b) && b.length >= 4)
        .map((b) => ({
          x1: toNum(b[0]),
          y1: toNum(b[1]),
          x2: toNum(b[2]),
          y2: toNum(b[3]),
          p: toNum(b[4]),
        }))
        .filter((c) => [c.x1, c.y1, c.x2, c.y2].every(Number.isFinite));
      if (!coords.length) return [];
      const x1 = Math.min(...coords.map((c) => c.x1));
      const y1 = Math.min(...coords.map((c) => c.y1));
      const x2 = Math.max(...coords.map((c) => c.x2));
      const y2 = Math.max(...coords.map((c) => c.y2));
      // Prefer the most common page number if provided, else default to 1
      const pageCounts: Record<string, number> = {};
      for (const c of coords) {
        const key = Number.isFinite(c.p) ? String(c.p) : '1';
        pageCounts[key] = (pageCounts[key] || 0) + 1;
      }
      const page = Number(Object.keys(pageCounts).sort((a, b) => pageCounts[b] - pageCounts[a])[0] || '1');
      return [[x1, y1, x2, y2, page]];
    };

    const doc = obj?.document;
    if (!doc) return undefined;

    // Detect new format: no pages array, metadata fields are pairs
    const looksNew =
      !Array.isArray(doc.pages) &&
      doc.metadata &&
      (Array.isArray(doc.metadata.document_type) || Array.isArray(doc.metadata.date) || Array.isArray(doc.metadata.purchase_order_no));

    if (!looksNew) return undefined;

    const md = doc.metadata || {};
    const parties = doc.parties || {};
    const vendor = parties.vendor_information || parties.vendor || {};
    const customer = parties.customer_information || parties.customer || {};

    const items = Array.isArray(doc.items) ? doc.items : [];
    const otherInfoObj = doc.other_information && typeof doc.other_information === 'object' ? doc.other_information : {};

    // Attempt to infer a page number from any available bbox in metadata
    const inferPage = () => {
      const candidates: any[] = [
        md.document_type?.[1],
        md.date?.[1],
        md.purchase_order_no?.[1],
      ].filter(Boolean);
      for (const c of candidates) {
        const p = toNum(Array.isArray(c) ? c[4] : undefined);
        if (Number.isFinite(p)) return p;
      }
      return 1;
    };
    const page_number = inferPage();

    // Map metadata
    const metadata = {
      document_title: fromPair(md.document_type),
      date: fromPair(md.date),
      purchase_order_no: fromPair(md.purchase_order_no),
    };

    // Map vendor info (sales_person may not exist in new format)
    const vendor_information = {
      vendor_name: fromPair(vendor.vendor_name),
      address: fromPair(vendor.address),
      contact_no: fromPair(vendor.contact_no),
      sales_person: fromPair(vendor.sales_person),
    };

    // Map customer info (email may be missing)
    const customer_information = {
      customer_name: fromPair(customer.customer_name),
      address: fromPair(customer.address),
      contact_no: fromPair(customer.contact_no),
      contact_person: fromPair(customer.contact_person),
      email_address: fromPair(customer.email_address),
    };

    // Map items to our shape; combine their subfield boxes into one bbox for the item row
    const mappedItems = items.map((it: any) => {
      const details = fromPair(it.details);
      const quantity = fromPair(it.quantity);
      const unit_price = fromPair(it.unit_price);
      const total = fromPair(it.total);

      const candidateBoxes: any[] = [];
      [it.item_no?.[1], it.details?.[1], it.unit?.[1], it.quantity?.[1], it.unit_price?.[1], it.total?.[1]].forEach((b) => {
        if (Array.isArray(b)) candidateBoxes.push(b);
      });

      return {
        description: details.value || '',
        quantity: quantity.value || '',
        unit_price: unit_price.value || '',
        total: total.value || '',
        bounding_box: combineBoxes(candidateBoxes),
      };
    });

    // Map other_information object => array of objects with FieldValue
    const other_information: Array<any> = [];
    for (const [key, pair] of Object.entries(otherInfoObj)) {
      other_information.push({ [key]: fromPair(pair) });
    }

    return {
      document: {
        pages: [
          {
            page_number,
            metadata,
            parties: { vendor_information },
            customerparties: { customer_information },
            items: mappedItems,
            other_information,
          },
        ],
      },
    };
  }

  const coerceDocumentData = (row: any) => {
    const candidates = [
      row?.PDF_AI_OUTPUT,
      row?.['PDF_AI_OUTPUT'],
      row?.pdf_ai_output,
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

        // Old format: already has pages
        if (obj?.document?.pages && Array.isArray(obj.document.pages) && obj.document.pages.length > 0) {
          return obj;
        }
        // New format: convert to old shape
        const converted = convertNewFormatToOld(obj);
        // Fix: avoid comparing possibly undefined length
        if (converted && Array.isArray(converted.document?.pages) && converted.document.pages.length > 0) {
          return converted;
        }
      } catch {
        // ignore parse errors
      }
    }
    return undefined;
  };

  // Add: extract SAP output, key/value renderer, and hierarchical renderer
  // Extracts SAP output object from a row (handles string/object inputs and nested `output`)
  const extractSapOutput = (row: any): any | undefined => {
    if (!row) return undefined;
    const candidates: Array<any> = [
      row?.SAP_AI_OUTPUT,
      row?.sap_ai_output,
      row?.['SAP_AI_OUTPUT'],
      row?.sap_payload,
      row?.SAP,
      row?.sap,
    ];
    for (const cand of candidates) {
      if (!cand) continue;
      try {
        const obj = typeof cand === 'string' ? JSON.parse(cand) : cand;
        const out = obj?.output ?? obj;
        if (out && typeof out === 'object') return out;
      } catch {
        // ignore parse errors
      }
    }
    return undefined;
  };

  // Simple key/value row
  const KV = ({ label, value }: { label: string; value: any }) => (
    <div className="flex items-center justify-between rounded border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium max-w-[60%] truncate" title={String(value)}>
        {String(value ?? '—')}
      </div>
    </div>
  );

  // Hierarchical renderer similar to Dashboard with minor refinements
  const renderSap = (out: any) => {
    if (!out || typeof out !== 'object') {
      return <div className="text-sm text-muted-foreground">No SAP data.</div>;
    }
    const headerIgnore = new Set(['to_Partner', 'to_PricingElement', 'to_Item']);
    const headerPairs = Object.entries(out)
      .filter(
        ([k, v]) =>
          !headerIgnore.has(k) &&
          (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      )
      .sort(([a], [b]) => a.localeCompare(b));

    return (
      <div className="space-y-6">
        <div>
          <div className="font-semibold mb-2">Header</div>
          {headerPairs.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {headerPairs.map(([k, v]) => (
                <KV key={k} label={k} value={v} />
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No header fields.</div>
          )}
        </div>

        {Array.isArray(out?.to_Partner) && (
          <div>
            <div className="font-semibold mb-2">Partners</div>
            <div className="space-y-2">
              {out.to_Partner.map((p: any, idx: number) => (
                <div key={idx} className="rounded border p-2">
                  <div className="text-xs text-muted-foreground mb-1">Partner {idx + 1}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {Object.entries(p || {}).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between rounded bg-card/50 p-2">
                        <div className="text-xs text-muted-foreground">{k}</div>
                        <div className="text-sm font-medium max-w-[60%] truncate" title={String(v)}>
                          {String(v ?? '—')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {Array.isArray(out?.to_PricingElement) && (
          <div>
            <div className="font-semibold mb-2">Header Pricing</div>
            <div className="space-y-2">
              {out.to_PricingElement.map((pe: any, idx: number) => (
                <div key={idx} className="rounded border p-2">
                  <div className="text-xs text-muted-foreground mb-1">Pricing {idx + 1}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {Object.entries(pe || {}).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between rounded bg-card/50 p-2">
                        <div className="text-xs text-muted-foreground">{k}</div>
                        <div className="text-sm font-medium max-w-[60%] truncate" title={String(v)}>
                          {String(v ?? '—')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {Array.isArray(out?.to_Item) && (
          <div>
            <div className="font-semibold mb-2">Items</div>
            <div className="space-y-3">
              {out.to_Item.map((it: any, idx: number) => {
                const partners = Array.isArray(it?.to_ItemPartner) ? it.to_ItemPartner : [];
                const prices = Array.isArray(it?.to_ItemPricingElement) ? it.to_ItemPricingElement : [];
                const itemHeaderPairs = Object.entries(it || {})
                  .filter(
                    ([k, v]) =>
                      !['to_ItemPartner', 'to_ItemPricingElement'].includes(k) &&
                      (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
                  )
                  .sort(([a], [b]) => a.localeCompare(b));
                return (
                  <div key={idx} className="rounded border p-2 space-y-2">
                    <div className="text-xs text-muted-foreground">Item {idx + 1}</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {itemHeaderPairs.map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between rounded bg-card/50 p-2">
                          <div className="text-xs text-muted-foreground">{k}</div>
                          <div className="text-sm font-medium max-w-[60%] truncate" title={String(v)}>
                            {String(v ?? '—')}
                          </div>
                        </div>
                      ))}
                    </div>

                    {partners.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium">Item Partners</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {partners.map((p: any, pi: number) => (
                            <div key={pi} className="rounded border p-2">
                              <div className="grid grid-cols-1 gap-1">
                                {Object.entries(p || {}).map(([k, v]) => (
                                  <div key={k} className="flex items-center justify-between">
                                    <span className="text-[11px] text-muted-foreground">{k}</span>
                                    <span className="text-sm font-medium">{String(v ?? '—')}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {prices.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium">Item Pricing</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {prices.map((pr: any, ri: number) => (
                            <div key={ri} className="rounded border p-2">
                              <div className="grid grid-cols-1 gap-1">
                                {Object.entries(pr || {}).map(([k, v]) => (
                                  <div key={k} className="flex items-center justify-between">
                                    <span className="text-[11px] text-muted-foreground">{k}</span>
                                    <span className="text-sm font-medium">{String(v ?? '—')}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const fetchDocument = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('N8N Logs')
        .select('*')
        .eq('id', documentId)
        .single();

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      if (!data) {
        toast.error('Document not found');
        navigate('/dashboard');
        return;
      }

      // Extract SAP output for viewer
      const out = extractSapOutput(data);
      setSapOut(out ?? null);

      // Build robust storage path from possible fields
      const bucket = data?.['Bucket Name'] ?? data?.bucket_name ?? data?.bucket ?? '';
      const objectPathCandidates = [
        data?.path,
        data?.['Path'],
        data?.object_path,
        data?.['Object Path'],
        data?.file,
        data?.filename,
        data?.name,
      ];
      const objectPath = objectPathCandidates.find((v: any) => typeof v === 'string' && v.trim().length > 0) as string | undefined;

      let path = '';
      if (bucket && objectPath) {
        path = `${bucket}/${objectPath}`;
      } else if (typeof data?.path === 'string') {
        path = String(data.path);
      } else if (typeof data?.['Bucket Name'] === 'string' && String(data['Bucket Name']).includes('/')) {
        // Some rows may store full path in "Bucket Name"
        path = String(data['Bucket Name']);
      }

      // Prefer a signed URL to avoid Chrome blocking and private bucket issues
      const signedUrl = path ? await createSignedUrlForPath(path, 60 * 10) : '';
      const pdf_url = signedUrl || (path ? publicUrlForPath(path) : '');

      console.log('Document data:', {
        id: data.id,
        path,
        signed: Boolean(signedUrl),
        pdf_url,
        bucket_name: data?.['Bucket Name'],
        all_keys: Object.keys(data),
        raw_data: data,
      });

      if (!pdf_url) {
        console.error('No PDF URL could be constructed. Available data:', data);
        toast.error('PDF URL is missing from document data');
      }

      const status = data?.status ?? data?.Status ?? data?.state ?? data?.State;
      const created_at = data?.created_at ?? data?.createdAt ?? data?.timestamp ?? new Date().toISOString();
      const document_data = coerceDocumentData(data);
      const title =
        document_data?.document?.pages?.[0]?.metadata?.document_title?.value ||
        // fallback to new format (if conversion failed for some reason)
        (typeof data?.pdf_ai_output === 'string'
          ? (() => {
              try {
                const parsed = JSON.parse(data.pdf_ai_output);
                const dt = parsed?.document?.metadata?.document_type?.[0];
                return typeof dt === 'string' ? dt : undefined;
              } catch {
                return undefined;
              }
            })()
          : undefined) ||
        (typeof data?.title === 'string' ? data.title : undefined) ||
        (typeof path === 'string' ? String(path).split('/').pop() : undefined) ||
        'Untitled Document';

      setDoc({
        id: String(data.id),
        created_at: String(created_at),
        pdf_url,
        status: status ? String(status) : undefined,
        document_data,
        title,
      });
    } catch (error) {
      console.error('Error fetching document:', error);
      toast.error(`Failed to load document: ${error instanceof Error ? error.message : 'Unknown error'}`);
      navigate('/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  // removed SAP editor handlers

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !doc) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between px-8 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/dashboard')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Documents
            </Button>
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <h1 className="text-lg font-semibold">{doc.title}</h1>
                {doc.status && (
                  <span className="text-xs text-muted-foreground">{doc.status}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a 
              href={doc.pdf_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Open PDF in new tab
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* PDF Viewer */}
        <div className="relative h-full min-w-0 flex-1 overflow-hidden">
          <PDFViewer pdfUrl={doc.pdf_url} highlightBox={highlightBox} documentData={doc.document_data} />
        </div>

        {/* Document Fields */}
        <aside ref={asideRef} className="relative w-[420px] lg:w-[560px] border-l bg-background overflow-hidden flex-shrink-0">
          <div className="p-4 border-b">
            <Card className="bg-card/60">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>SAP Data</span>
                  <div className="text-xs text-muted-foreground">
                    {sapOut ? 'Loaded' : 'No SAP data'}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="toggleSap"
                      checked={showSAP}
                      onCheckedChange={(v) => setShowSAP(Boolean(v))}
                    />
                    <Label htmlFor="toggleSap" className="cursor-pointer">
                      Show SAP Data
                    </Label>
                  </div>
                </div>

                {showSAP ? (
                  <div className="space-y-4">
                    {sapOut ? renderSap(sapOut) : (
                      <div className="text-sm text-muted-foreground">No SAP data.</div>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          {doc.document_data &&
          doc.document_data?.document?.pages?.length > 0 ? (
            <DocumentFields
              documentData={doc.document_data}
              onFieldHover={setHighlightBox}
            />
          ) : (
            <div className="h-full p-6 text-sm text-muted-foreground">
              No structured data available for this document.
            </div>
          )}

          {/* Scroll to top button for fields panel */}
          <Button
            variant="outline"
            size="icon"
            className="absolute bottom-4 right-4 z-20 rounded-full h-8 w-8"
            onClick={() => {
              const viewport = asideRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
              if (viewport) {
                viewport.scrollTo({ top: 0, behavior: 'smooth' });
              } else {
                // Fallback: scroll the aside if viewport not detected
                asideRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            aria-label="Scroll to top"
            title="Scroll to top"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </aside>
      </div>
    </div>
  );
}