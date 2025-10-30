import { DocumentFields } from '@/components/DocumentFields';
import { PDFViewer } from '@/components/PDFViewer';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { User } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { supabase, type BoundingBox, hasSupabaseEnv, publicUrlForPath } from '@/lib/supabase';
import { createSignedUrlForPath } from '@/lib/supabase';
import { motion } from 'framer-motion';
import { ArrowLeft, FileText, Loader2, ExternalLink, ArrowUp } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

export default function DocumentDetail() {
  const { isLoading: authLoading, isAuthenticated, user, signOut } = useAuth();
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
  const [showSAP, setShowSAP] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('showSAP');
      return v === null ? true : v === 'true';
    } catch {
      return true;
    }
  });
  const [sapOut, setSapOut] = useState<any | null>(null);

  // Add: editor + saving/creating states for SAP JSON
  const [sapEditorValue, setSapEditorValue] = useState<string>('');
  const [sapObj, setSapObj] = useState<any>({}); // new: source of truth for inline form fields
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [currentItemIndex, setCurrentItemIndex] = useState<number>(0);

  // Add aside ref for scroll-to-top control
  const asideRef = useRef<HTMLDivElement | null>(null);

  // Add: view state to switch between 'sap' full-screen and 'document' split view
  const [view, setView] = useState<'sap' | 'document'>('document');

  // Removed view sync with showSAP so PDF + data are visible by default and independent of the toggle.

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
  }, [isAuthenticated, documentId, showSAP]);

  // removed editor sync effect

  // Initialize editor content whenever sapOut loads/changes
  useEffect(() => {
    if (sapOut) {
      try {
        setSapEditorValue(JSON.stringify(sapOut, null, 2));
      } catch {
        setSapEditorValue('');
      }
    }
  }, [sapOut]);

  // Keep editor in sync and initialize editable object when sapOut changes
  useEffect(() => {
    if (sapOut) {
      try {
        setSapObj(sapOut);
        setSapEditorValue(JSON.stringify(sapOut, null, 2));
      } catch {
        setSapObj({});
        setSapEditorValue('');
      }
    } else {
      setSapObj({});
      setSapEditorValue('');
    }
  }, [sapOut]);

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

  // Extracts SAP output object from a row and normalizes nested arrays/keys for UI rendering.
  const extractSapOutput = (row: any): any | undefined => {
    if (!row) return undefined;

    const isSapLike = (obj: any): boolean => {
      if (!obj || typeof obj !== 'object') return false;
      const hasSub =
        Array.isArray(obj.to_Item) ||
        Array.isArray(obj.to_Partner) ||
        Array.isArray(obj.to_PricingElement);
      if (hasSub) return true;
      const headerHints = [
        'DocType',
        'SalesOrganization',
        'DistributionChannel',
        'Division',
        'SalesOrg',
        'SalesOffice',
      ];
      for (const key of headerHints) {
        if (typeof obj[key] === 'string' || typeof obj[key] === 'number') return true;
      }
      return false;
    };

    const tryParse = (val: any): any | undefined => {
      try {
        const obj = typeof val === 'string' ? JSON.parse(val) : val;
        if (obj && typeof obj === 'object') {
          return obj?.output ?? obj;
        }
      } catch {
        // ignore parse errors
      }
      return undefined;
    };

    const pickArray = (obj: any, keys: string[]) => {
      for (const k of keys) {
        const v = obj?.[k];
        if (Array.isArray(v)) return v;
        if (v && Array.isArray(v.results)) return v.results;
      }
      return undefined;
    };

    const normalizeSap = (src: any) => {
      if (!src || typeof src !== 'object') return undefined;
      let root = src;

      // OData-like wrapping
      if (root?.d) {
        const d = root.d;
        if (Array.isArray(d?.results) && d.results.length > 0) {
          root = d.results[0];
        } else {
          root = d;
        }
      }

      const out: any = { ...root };

      // Top-level collections (support varied casings/aliases)
      const items = pickArray(root, ['to_Item', 'to_item', 'Items', 'items', 'TO_ITEM', 'to_Items']);
      if (items) out.to_Item = items;

      const partners = pickArray(root, ['to_Partner', 'to_partner', 'Partners', 'partners', 'TO_PARTNER']);
      if (partners) out.to_Partner = partners;

      const pricing = pickArray(
        root,
        ['to_PricingElement', 'to_pricingelement', 'to_PricingElements', 'pricing', 'Pricing', 'TO_PRICINGELEMENT']
      );
      if (pricing) out.to_PricingElement = pricing;

      // Normalize each item nested arrays
      if (Array.isArray(out.to_Item)) {
        out.to_Item = out.to_Item.map((it: any) => {
          const i: any = { ...it };
          const itemPartners = pickArray(it, [
            'to_ItemPartner',
            'to_itempartner',
            'ItemPartners',
            'item_partners',
            'to_Item_Partner',
          ]);
          if (itemPartners) i.to_ItemPartner = itemPartners;

          const itemPricing = pickArray(it, [
            'to_ItemPricingElement',
            'to_itempricingelement',
            'ItemPricing',
            'item_pricing',
            'to_Item_PricingElement',
          ]);
          if (itemPricing) i.to_ItemPricingElement = itemPricing;

          return i;
        });
      }

      return out;
    };

    // Direct candidates (common names)
    const directCandidates: Array<any> = [
      // Prefer "SAP JSON from app" style fields first
      row?.SAP_JSON_FROM_APP,
      row?.sap_json_from_app,
      row?.['SAP JSON from app'],
      row?.sap_json_app,
      row?.sap_app_json,

      // Then fall back to other common SAP payload fields
      row?.SAP_AI_OUTPUT,
      row?.sap_ai_output,
      row?.['SAP_AI_OUTPUT'],
      row?.sap_payload,
      row?.SAP,
      row?.sap,
      row?.sap_output,
      row?.SAP_Output,
      row?.sapOutput,
      row?.sap_payload_json,
      row?.sap_payload_string,
    ];
    for (const cand of directCandidates) {
      const parsed = tryParse(cand);
      if (parsed) {
        const norm = normalizeSap(parsed);
        if (norm && isSapLike(norm)) return norm;
        if (isSapLike(parsed)) return parsed;
      }
    }

    // Keys that include 'sap' anywhere
    for (const [key, value] of Object.entries(row)) {
      if (key.toLowerCase().includes('sap')) {
        const parsed = tryParse(value);
        if (parsed) {
          const norm = normalizeSap(parsed);
          if (norm && isSapLike(norm)) return norm;
          if (isSapLike(parsed)) return parsed;
        }
      }
    }

    // Fallback: scan all values for any JSON that looks like SAP
    for (const value of Object.values(row)) {
      const parsed = tryParse(value);
      if (parsed) {
        const norm = normalizeSap(parsed);
        if (norm && isSapLike(norm)) return norm;
        if (isSapLike(parsed)) return parsed;
      }
    }

    return undefined;
  };

  // Simple key/value row
  const KV = ({ label, value }: { label: string; value: any }) => (
    <div className="rounded border p-2">
      <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
      <div className="text-sm font-medium whitespace-pre-wrap break-words">
        {String(value ?? '—')}
      </div>
    </div>
  );

  // Helpers to coerce types and keep JSON string synced with object edits
  const coerceValue = (input: string, original: any) => {
    if (typeof original === 'number') {
      const n = Number(input);
      return Number.isFinite(n) ? n : 0;
    }
    if (typeof original === 'boolean') {
      const val = input.trim().toLowerCase();
      return val === 'true' || val === '1';
    }
    return input;
  };

  const syncEditorFromObj = (next: any) => {
    try {
      setSapEditorValue(JSON.stringify(next, null, 2));
    } catch {
      // ignore stringify errors
    }
  };

  const updateHeaderField = (key: string, value: string) => {
    setSapObj((prev: any) => {
      const typed = coerceValue(value, prev?.[key]);
      const next = { ...prev, [key]: typed };
      syncEditorFromObj(next);
      return next;
    });
  };

  const updatePartnerField = (index: number, key: string, value: string) => {
    setSapObj((prev: any) => {
      const arr: any[] = Array.isArray(prev?.to_Partner) ? [...prev.to_Partner] : [];
      const row = { ...(arr[index] || {}) };
      const typed = coerceValue(value, row[key]);
      row[key] = typed;
      arr[index] = row;
      const next = { ...prev, to_Partner: arr };
      syncEditorFromObj(next);
      return next;
    });
  };

  const updatePricingField = (index: number, key: string, value: string) => {
    setSapObj((prev: any) => {
      const arr: any[] = Array.isArray(prev?.to_PricingElement) ? [...prev.to_PricingElement] : [];
      const row = { ...(arr[index] || {}) };
      const typed = coerceValue(value, row[key]);
      row[key] = typed;
      arr[index] = row;
      const next = { ...prev, to_PricingElement: arr };
      syncEditorFromObj(next);
      return next;
    });
  };

  const updateItemField = (itemIndex: number, key: string, value: string) => {
    setSapObj((prev: any) => {
      const items: any[] = Array.isArray(prev?.to_Item) ? [...prev.to_Item] : [];
      const item = { ...(items[itemIndex] || {}) };
      const typed = coerceValue(value, item[key]);
      item[key] = typed;
      items[itemIndex] = item;
      const next = { ...prev, to_Item: items };
      syncEditorFromObj(next);
      return next;
    });
  };

  const updateItemPartnerField = (itemIndex: number, partnerIndex: number, key: string, value: string) => {
    setSapObj((prev: any) => {
      const items: any[] = Array.isArray(prev?.to_Item) ? [...prev.to_Item] : [];
      const item = { ...(items[itemIndex] || {}) };
      const partners: any[] = Array.isArray(item.to_ItemPartner) ? [...item.to_ItemPartner] : [];
      const row = { ...(partners[partnerIndex] || {}) };
      const typed = coerceValue(value, row[key]);
      row[key] = typed;
      partners[partnerIndex] = row;
      item.to_ItemPartner = partners;
      items[itemIndex] = item;
      const next = { ...prev, to_Item: items };
      syncEditorFromObj(next);
      return next;
    });
  };

  const updateItemPricingField = (itemIndex: number, priceIndex: number, key: string, value: string) => {
    setSapObj((prev: any) => {
      const items: any[] = Array.isArray(prev?.to_Item) ? [...prev.to_Item] : [];
      const item = { ...(items[itemIndex] || {}) };
      const prices: any[] = Array.isArray(item.to_ItemPricingElement) ? [...item.to_ItemPricingElement] : [];
      const row = { ...(prices[priceIndex] || {}) };
      const typed = coerceValue(value, row[key]);
      row[key] = typed;
      prices[priceIndex] = row;
      item.to_ItemPricingElement = prices;
      items[itemIndex] = item;
      const next = { ...prev, to_Item: items };
      syncEditorFromObj(next);
      return next;
    });
  };

  // Add a local keydown handler to prevent PDF shortcuts while typing
  const onEditingKeyDown = (e: any) => {
    if (e.key === '0') {
      e.stopPropagation();
    }
  };

  const renderSapEditable = (out: any) => {
    if (!out || typeof out !== 'object') {
      return <div className="text-base text-muted-foreground">No SAP data.</div>;
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
      <Accordion type="multiple" defaultValue={['header']} className="space-y-3">
        <AccordionItem value="header">
          <AccordionTrigger className="text-base font-semibold">
            Header ({headerPairs.length})
          </AccordionTrigger>
          <AccordionContent>
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
            {headerPairs.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {headerPairs.map(([k, v]) => (
                  <div key={k} className="rounded bg-card/50 p-3 border">
                    <div className="text-sm text-muted-foreground mb-1.5">{k}</div>
                    <Input
                      value={String(v ?? '')}
                      onChange={(e) => updateHeaderField(k, e.target.value)}
                      className="h-9 text-base"
                      onKeyDown={onEditingKeyDown}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No header fields.</div>
            )}

            {Array.isArray(out?.to_Partner) && out.to_Partner.length > 0 && (
              <Accordion type="multiple" className="mt-5">
                <AccordionItem value="partners">
                  <AccordionTrigger className="text-base font-semibold">
                    Partners ({out.to_Partner.length})
                  </AccordionTrigger>
                  <AccordionContent>
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="space-y-2"
                    >
                      {out.to_Partner.map((p: any, idx: number) => (
                        <div key={idx} className="rounded border p-3 bg-card/40">
                          <div className="text-sm text-muted-foreground mb-2">Partner {idx + 1}</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {Object.entries(p || {}).map(([k, v]) => (
                              <div key={k} className="rounded bg-card/50 p-3 border">
                                <div className="text-sm text-muted-foreground mb-1.5">{k}</div>
                                <Input
                                  value={String(v ?? '')}
                                  onChange={(e) => updatePartnerField(idx, k, e.target.value)}
                                  className="h-9 text-base"
                                  onKeyDown={onEditingKeyDown}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {Array.isArray(out?.to_PricingElement) && out.to_PricingElement.length > 0 && (
              <Accordion type="multiple" className="mt-5">
                <AccordionItem value="pricing">
                  <AccordionTrigger className="text-base font-semibold">
                    Header Pricing ({out.to_PricingElement.length})
                  </AccordionTrigger>
                  <AccordionContent>
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="space-y-2"
                    >
                      {out.to_PricingElement.map((pe: any, idx: number) => (
                        <div key={idx} className="rounded border p-3 bg-card/40">
                          <div className="text-sm text-muted-foreground mb-2">Pricing {idx + 1}</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {Object.entries(pe || {}).map(([k, v]) => (
                              <div key={k} className="rounded bg-card/50 p-3 border">
                                <div className="text-sm text-muted-foreground mb-1.5">{k}</div>
                                <Input
                                  value={String(v ?? '')}
                                  onChange={(e) => updatePricingField(idx, k, e.target.value)}
                                  className="h-9 text-base"
                                  onKeyDown={onEditingKeyDown}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {Array.isArray(out?.to_Item) && out.to_Item.length > 0 && (
              <Accordion type="multiple" className="mt-5">
                <AccordionItem value="items">
                  <AccordionTrigger className="text-base font-semibold">
                    Items ({out.to_Item.length})
                  </AccordionTrigger>
                  <AccordionContent>
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="space-y-3"
                    >
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
                    <Accordion key={idx} type="multiple" className="rounded border bg-card/40">
                      <AccordionItem value={`item-${idx}`}>
                        <AccordionTrigger className="px-3 text-sm font-medium">
                          Item {idx + 1}
                        </AccordionTrigger>
                        <AccordionContent className="px-3 pb-3 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {itemHeaderPairs.map(([k, v]) => (
                              <div key={k} className="rounded bg-card/50 p-3 border">
                                <div className="text-sm text-muted-foreground mb-1.5">{k}</div>
                                <Input
                                  value={String(v ?? '')}
                                  onChange={(e) => updateItemField(idx, k, e.target.value)}
                                  className="h-9 text-base"
                                  onKeyDown={onEditingKeyDown}
                                />
                              </div>
                            ))}
                          </div>

                      {partners.length > 0 && (
                        <Accordion type="multiple">
                          <AccordionItem value="item-partners">
                            <AccordionTrigger className="text-sm font-medium">
                              Item Partners ({partners.length})
                            </AccordionTrigger>
                            <AccordionContent>
                              <motion.div
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.25 }}
                                className="grid grid-cols-1 md:grid-cols-2 gap-2"
                              >
                                {partners.map((p: any, pi: number) => (
                                  <div key={pi} className="rounded border p-3 bg-card/30">
                                    <div className="grid grid-cols-1 gap-2">
                                      {Object.entries(p || {}).map(([k, v]) => (
                                        <div key={k} className="rounded bg-card/50 p-3 border">
                                          <div className="text-sm text-muted-foreground mb-1.5">{k}</div>
                                          <Input
                                            value={String(v ?? '')}
                                            onChange={(e) => updateItemPartnerField(idx, pi, k, e.target.value)}
                                            className="h-9 text-base"
                                            onKeyDown={onEditingKeyDown}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </motion.div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}

                      {prices.length > 0 && (
                        <Accordion type="multiple">
                          <AccordionItem value="item-pricing">
                            <AccordionTrigger className="text-sm font-medium">
                              Item Pricing ({prices.length})
                            </AccordionTrigger>
                            <AccordionContent>
                              <motion.div
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.25 }}
                                className="grid grid-cols-1 md:grid-cols-2 gap-2"
                              >
                                {prices.map((pr: any, ri: number) => (
                                  <div key={ri} className="rounded border p-3 bg-card/30">
                                    <div className="grid grid-cols-1 gap-2">
                                      {Object.entries(pr || {}).map(([k, v]) => (
                                        <div key={k} className="rounded bg-card/50 p-3 border">
                                          <div className="text-sm text-muted-foreground mb-1.5">{k}</div>
                                          <Input
                                            value={String(v ?? '')}
                                            onChange={(e) => updateItemPricingField(idx, ri, k, e.target.value)}
                                            className="h-9 text-base"
                                            onKeyDown={onEditingKeyDown}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </motion.div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                      );
                    })}
                    </motion.div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
            </motion.div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
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
      const out = showSAP ? extractSapOutput(data) : undefined;
      setSapOut(showSAP ? (out ?? null) : null);

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
      const document_data = showSAP ? coerceDocumentData(data) : undefined;
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

  // Create button: POST id + current SAP JSON to webhook from env
  const handleCreate = async () => {
    try {
      if (!doc?.id) {
        toast.error('Missing document id');
        return;
      }
      if (!sapEditorValue?.trim()) {
        toast.error('No SAP data to send');
        return;
      }

      const rawUrl = import.meta.env.VITE_WEBHOOK_URL as string | undefined;
      if (!rawUrl) {
        toast.error('Webhook URL is not configured');
        return;
      }

      let url: URL;
      try {
        url = new URL(rawUrl);
      } catch {
        toast.error('Invalid webhook URL');
        return;
      }
      if (url.protocol !== 'https:') {
        toast.error('Webhook URL must use HTTPS');
        return;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(sapEditorValue);
      } catch {
        toast.error('Edited SAP JSON is invalid');
        return;
      }

      if (!window.confirm(`Send SAP for document ${doc.id}?`)) {
        return;
      }

      setIsCreating(true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: doc.id, sap: parsed }),
        signal: controller.signal,
        mode: 'cors',
        cache: 'no-store',
      }).catch((err) => {
        if (err?.name === 'AbortError') throw new Error('Request timed out (15s)');
        throw new Error('Network error or CORS blocked');
      });

      clearTimeout(timeoutId);

      if (!res || !res.ok) {
        throw new Error(`Status ${res?.status ?? 'unknown'}`);
      }

      toast.success('Create request sent successfully');
    } catch (e) {
      toast.error(`Failed to send: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSave = async () => {
    try {
      if (!doc?.id) {
        toast.error('Missing document id');
        return;
      }
      if (!hasSupabaseEnv) {
        toast.error('Supabase is not configured.');
        return;
      }
      let payload: any;
      try {
        payload = JSON.parse(sapEditorValue || '{}');
      } catch {
        toast.error('Edited JSON is not valid');
        return;
      }

      setIsSaving(true);
      // Try updating common "SAP JSON from app" fields; fall back to SAP_AI_OUTPUT
      const fieldCandidates: Array<string> = [
        'SAP_JSON_FROM_APP',
        'SAP_JSON_from_APP', // added variant seen in error message
        'sap_json_from_app',
        'SAP JSON from app',
        'sap_json_app',
        'sap_app_json',
      ];
      let saved = false;
      for (const field of fieldCandidates) {
        const { error } = await supabase
          .from('N8N Logs')
          .update({ [field]: payload })
          .eq('id', doc.id);
        if (!error) {
          saved = true;
          break;
        } else {
          const msg = String(error.message || '').toLowerCase();
          // Be lenient: continue to next field on any "missing column" style error
          if (
            msg.includes('column') ||
            msg.includes('does not exist') ||
            msg.includes('schema cache') ||
            msg.includes('could not find') ||
            msg.includes('not found')
          ) {
            continue;
          }
          throw error;
        }
      }
      if (!saved) {
        const { error: fbError } = await supabase
          .from('N8N Logs')
          .update({ SAP_AI_OUTPUT: payload })
          .eq('id', doc.id);
        if (fbError) throw fbError;
      }
      toast.success('Saved successfully');
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message || e}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Persist showSAP to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('showSAP', String(showSAP));
    } catch {
      // ignore storage errors
    }
  }, [showSAP]);

  // Navigation across documents: get id from route and provide prev/next
  const params = useParams();
  const currentId = (params as any).id as string | undefined;

  const [idList, setIdList] = useState<Array<string>>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!hasSupabaseEnv) return;
        const { data, error } = await supabase
          .from("N8N Logs")
          .select("id")
          .order("id", { ascending: true })
          .limit(1000);

        if (error || !data) return;
        const list: Array<string> = data.map((r: any) => String(r.id));
        if (cancelled) return;
        setIdList(list);
        const idx = list.findIndex((x) => x === String(currentId || ""));
        setCurrentIndex(idx);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentId, hasSupabaseEnv]);

  const goPrev = () => {
    if (currentIndex > 0) {
      navigate(`/document/${idList[currentIndex - 1]}`);
    }
  };
  const goNext = () => {
    if (currentIndex >= 0 && currentIndex < idList.length - 1) {
      navigate(`/document/${idList[currentIndex + 1]}`);
    }
  };

  // Initialize first line highlight when document data becomes available
  useEffect(() => {
    try {
      const items = Array.isArray(doc?.document_data?.document?.pages)
        ? (doc?.document_data?.document?.pages?.[0]?.items ?? [])
        : [];
      if (Array.isArray(items) && items.length > 0) {
        setCurrentItemIndex(0);
        const bbox = items[0]?.bounding_box?.[0];
        if (Array.isArray(bbox) && bbox.length >= 4) {
          const [x1, y1, x2, y2, p] = bbox;
          setHighlightBox({
            x: x1,
            y: y1,
            width: x2 - x1,
            height: y2 - y1,
            page: Number.isFinite(p) ? p : 1,
          });
        } else {
          setHighlightBox(null);
        }
      } else {
        setHighlightBox(null);
      }
    } catch {
      // ignore errors
    }
  }, [doc?.document_data]);

  // Line navigation: move between extracted items and highlight their bounding box
  const goPrevLine = () => {
    const items = Array.isArray(doc?.document_data?.document?.pages)
      ? (doc?.document_data?.document?.pages?.[0]?.items ?? [])
      : [];
    if (!Array.isArray(items) || items.length === 0) return;

    setCurrentItemIndex((prev) => {
      const next = Math.max(0, prev - 1);
      const bbox = items[next]?.bounding_box?.[0];
      if (Array.isArray(bbox) && bbox.length >= 4) {
        const [x1, y1, x2, y2, p] = bbox;
        setHighlightBox({
          x: x1,
          y: y1,
          width: x2 - x1,
          height: y2 - y1,
          page: Number.isFinite(p) ? p : 1,
        });
      } else {
        setHighlightBox(null);
      }
      return next;
    });
  };

  const goNextLine = () => {
    const items = Array.isArray(doc?.document_data?.document?.pages)
      ? (doc?.document_data?.document?.pages?.[0]?.items ?? [])
      : [];
    if (!Array.isArray(items) || items.length === 0) return;

    setCurrentItemIndex((prev) => {
      const next = Math.min(items.length - 1, prev + 1);
      const bbox = items[next]?.bounding_box?.[0];
      if (Array.isArray(bbox) && bbox.length >= 4) {
        const [x1, y1, x2, y2, p] = bbox;
        setHighlightBox({
          x: x1,
          y: y1,
          width: x2 - x1,
          height: y2 - y1,
          page: Number.isFinite(p) ? p : 1,
        });
      } else {
        setHighlightBox(null);
      }
      return next;
    });
  };

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
              variant="outline"
              size="sm"
              onClick={() => navigate('/dashboard')}
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
                <h1 className="text-lg font-semibold">{doc.title}</h1>
                {doc.status && (
                  <span className="text-xs text-muted-foreground">{doc.status}</span>
                )}
              </div>
            </div>
          </div>

          {/* Buttons and User Menu on the right */}
          <div className="flex items-center gap-3 ml-auto">
            {/* Step controls */}
            {showSAP && view === 'sap' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setView('document')}
                className="px-4 rounded-md"
              >
                Next Step
              </Button>
            )}

            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={!sapEditorValue?.trim() || isSaving || !doc?.id}
              className="px-4 rounded-md"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleCreate}
              disabled={!sapEditorValue?.trim() || isCreating || !doc?.id}
              className="px-4 rounded-md"
            >
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create
            </Button>

            {/* Document Navigation */}
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={goPrev} 
                disabled={currentIndex <= 0}
                className="px-4"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goNext}
                disabled={currentIndex < 0 || currentIndex >= idList.length - 1}
                className="px-4"
              >
                Next
              </Button>
            </div>

            {/* User Menu - moved to far right */}
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
                    <p className="text-sm font-medium leading-none">{user?.email || 'User'}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer">
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/dashboard')} className="cursor-pointer">
                  Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                  className="cursor-default flex items-center justify-between"
                >
                  <span>Show SAP Data</span>
                  <Switch
                    checked={showSAP}
                    onCheckedChange={(v) => setShowSAP(Boolean(v))}
                    aria-label="Toggle SAP Data"
                  />
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await signOut();
                    navigate('/');
                  }}
                  className="cursor-pointer text-red-600"
                >
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* SAP Full-screen (Step 1) */}
      {showSAP && view === 'sap' && (
        <div className="flex-1 flex flex-col overflow-hidden p-4">
          <Card className="flex-1 flex flex-col bg-card/60">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>SAP Data</span>
                <div className="flex items-center gap-3">
                  <div className="text-xs text-muted-foreground">
                    {sapOut ? 'Loaded' : 'No SAP data'}
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden">
              <div className="text-xs text-muted-foreground mb-3">
                Toggle SAP visibility from the user menu. Use "Next" to view the PDF and document data.
              </div>
              {showSAP ? (
                <ScrollArea className="h-full pr-1 overflow-y-auto">
                  {
                    (() => {
                      try {
                        const parsed = JSON.parse(sapEditorValue || '{}');
                        return renderSapEditable(parsed);
                      } catch {
                        return <div className="text-sm text-muted-foreground">Invalid JSON in editor. Fix to preview.</div>;
                      }
                    })()
                  }
                </ScrollArea>
              ) : (
                <div className="text-sm text-muted-foreground">
                  SAP data . Enable it from the user menu.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content (Step 2) */}
      <div className={showSAP && view === 'sap' ? 'hidden' : 'flex-1 flex overflow-hidden'}>
        {/* PDF Viewer */}
        <div className="relative h-full min-w-0 flex-1 overflow-hidden">
          {/* Overlay open-in-new tab button on PDF preview */}
          <div className="absolute top-3 right-3 z-10">
            <Button variant="secondary" size="sm" className="shadow-md" asChild>
              <a
                href={doc.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Open PDF in new tab"
                aria-label="Open PDF in new tab"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open PDF
              </a>
            </Button>
          </div>
          <PDFViewer
            pdfUrl={doc.pdf_url}
            highlightBox={highlightBox}
            documentData={showSAP ? doc.document_data : undefined}
          />
        </div>

        {/* Document Fields */}
        <aside ref={asideRef} className="relative w-[420px] lg:w-[560px] border-l bg-background overflow-y-auto flex-shrink-0 flex flex-col scroll-smooth">
          <div className="p-4 border-b">
            <Card className="bg-card/60">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>SAP Data</span>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-muted-foreground">
                      {sapOut ? 'Loaded' : 'No SAP data'}
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-xs text-muted-foreground">
                  Toggle SAP visibility from the user menu.
                </div>

                {showSAP ? (
                  <div className="space-y-4">
                    {/* Scrollable hierarchical view */}
                    <ScrollArea className="max-h-[60vh] pr-1 overflow-y-auto">
                      {
                        (() => {
                          try {
                            const parsed = JSON.parse(sapEditorValue || '{}');
                            return renderSapEditable(parsed);
                          } catch {
                            return <div className="text-sm text-muted-foreground">Invalid JSON in editor. Fix to preview.</div>;
                          }
                        })()
                      }
                    </ScrollArea>

                    {/* JSON editor removed; fields are now edited inline above */}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    SAP data hidden. Enable it from the user menu.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex-1 min-h-0">
            {showSAP ? (
              doc.document_data &&
              doc.document_data?.document?.pages?.length > 0 ? (
                <DocumentFields
                  documentData={doc.document_data}
                  onFieldHover={setHighlightBox}
                />
              ) : (
                <div className="h-full p-6 text-sm text-muted-foreground">
                  No structured data available for this document.
                </div>
              )
            ) : (
              <div className="h-full p-6 text-sm text-muted-foreground">
                SAP data hidden. Enable "Show SAP Data" from the user menu.
              </div>
            )}
          </div>

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