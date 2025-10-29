import { motion } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { ScrollArea } from './ui/scroll-area';
import type { BoundingBox, DocumentData } from '@/lib/supabase';

// Normalizes various bounding box shapes into { x, y, width, height, page? }
function normalizeBoxAny(input: any): (BoundingBox & { page?: number }) | null {
  if (!input) return null;

  const toNum = (v: any) => (v === null || v === undefined || v === '' ? NaN : Number(v));

  // Array formats: [x, y, w, h] or [x1, y1, x2, y2]
  if (Array.isArray(input)) {
    if (input.length < 4) return null;
    const x = toNum(input[0]);
    const y = toNum(input[1]);

    let width = toNum(input[2]);
    let height = toNum(input[3]);

    // If interpreted as x2,y2 → derive width/height
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      width = toNum(input[2]) - x;
      height = toNum(input[3]) - y;
    }

    const page = toNum(input[4]);
    if ([x, y, width, height].every(Number.isFinite)) {
      return { x, y, width, height, page: Number.isFinite(page) ? page : undefined };
    }
    return null;
  }

  // Object formats
  const x = toNum(input.x ?? input.left ?? input.x0 ?? input.x1 ?? input.startX ?? input.minX);
  const y = toNum(input.y ?? input.top ?? input.y0 ?? input.y1 ?? input.startY ?? input.minY);

  let width = toNum(input.width ?? input.w);
  let height = toNum(input.height ?? input.h);

  // Derive width/height from right/bottom or x2/y2 if missing
  if (!Number.isFinite(width)) {
    const x2 = toNum(input.x2 ?? input.right ?? input.maxX);
    if (Number.isFinite(x) && Number.isFinite(x2)) width = x2 - x;
  }
  if (!Number.isFinite(height)) {
    const y2 = toNum(input.y2 ?? input.bottom ?? input.maxY);
    if (Number.isFinite(y) && Number.isFinite(y2)) height = y2 - y;
  }

  const rawPage = input.page ?? input.page_number ?? input.pageIndex ?? input.p;
  const page = toNum(rawPage);

  if ([x, y, width, height].every(Number.isFinite)) {
    return { x, y, width, height, page: Number.isFinite(page) ? page : undefined };
  }
  return null;
}

interface DocumentFieldsProps {
  documentData: DocumentData;
  // Allow optional page to support cross-page highlight
  onFieldHover: (box: (BoundingBox & { page?: number }) | null) => void;
}

export function DocumentFields({ documentData, onFieldHover }: DocumentFieldsProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['metadata', 'vendor', 'customer', 'items'])
  );

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const page = documentData.document.pages[0];

  const FieldItem = ({
    label,
    value,
    boundingBox,
  }: {
    label: string;
    value: string;
    // accept any shape and normalize it
    boundingBox?: any[];
  }) => {
    const bb = normalizeBoxAny(boundingBox?.[0]);
    const dbg = bb
      ? `x:${Math.round(bb.x)} y:${Math.round(bb.y)} w:${Math.round(bb.width)} h:${Math.round(bb.height)} p:${bb.page ?? page.page_number}`
      : 'x:— y:— w:— h:— p:—';

    return (
      <motion.div
        className="py-3 px-4 cursor-pointer rounded-lg transition-all border bg-card/50 hover:bg-primary/5 hover:border-primary/30 hover:shadow-md"
        // Include page number from the bounding box if available
        onMouseEnter={() =>
          bb && onFieldHover({ ...bb, page: bb.page ?? page.page_number })
        }
        onMouseLeave={() => onFieldHover(null)}
      >
        <div className="text-xs font-medium text-muted-foreground mb-1.5">{label}</div>
        <div className="text-sm font-medium text-foreground truncate">{value || '—'}</div>
        <div className="mt-1 text-[10px] text-muted-foreground font-mono">{dbg}</div>
      </motion.div>
    );
  };

  const SectionHeader = ({ title, id }: { title: string; id: string }) => {
    const isExpanded = expandedSections.has(id);
    return (
      <button
        onClick={() => toggleSection(id)}
        className="flex items-center justify-between w-full py-3 px-4 hover:bg-muted/50 transition-colors rounded-lg group"
      >
        <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">{title}</h3>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        )}
      </button>
    );
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-4">
        {/* Metadata Section */}
        <div className="space-y-2 bg-card rounded-lg border p-2">
          <SectionHeader title="Document Metadata" id="metadata" />
          {expandedSections.has('metadata') && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 pt-2"
            >
              <FieldItem
                label="Document Title"
                value={page.metadata.document_title.value}
                boundingBox={page.metadata.document_title.bounding_box}
              />
              <FieldItem
                label="Date"
                value={page.metadata.date.value}
                boundingBox={page.metadata.date.bounding_box}
              />
              <FieldItem
                label="Purchase Order No"
                value={page.metadata.purchase_order_no.value}
                boundingBox={page.metadata.purchase_order_no.bounding_box}
              />
            </motion.div>
          )}
        </div>

        {/* Vendor Information */}
        <div className="space-y-2 bg-card rounded-lg border p-2">
          <SectionHeader title="Vendor Information" id="vendor" />
          {expandedSections.has('vendor') && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 pt-2"
            >
              <FieldItem
                label="Vendor Name"
                value={page.parties.vendor_information.vendor_name.value}
                boundingBox={page.parties.vendor_information.vendor_name.bounding_box}
              />
              <FieldItem
                label="Address"
                value={page.parties.vendor_information.address.value}
                boundingBox={page.parties.vendor_information.address.bounding_box}
              />
              <FieldItem
                label="Contact No"
                value={page.parties.vendor_information.contact_no.value}
                boundingBox={page.parties.vendor_information.contact_no.bounding_box}
              />
              <FieldItem
                label="Sales Person"
                value={page.parties.vendor_information.sales_person.value}
                boundingBox={page.parties.vendor_information.sales_person.bounding_box}
              />
            </motion.div>
          )}
        </div>

        {/* Customer Information */}
        <div className="space-y-2 bg-card rounded-lg border p-2">
          <SectionHeader title="Customer Information" id="customer" />
          {expandedSections.has('customer') && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 pt-2"
            >
              <FieldItem
                label="Customer Name"
                value={page.customerparties.customer_information.customer_name.value}
                boundingBox={page.customerparties.customer_information.customer_name.bounding_box}
              />
              <FieldItem
                label="Address"
                value={page.customerparties.customer_information.address.value}
                boundingBox={page.customerparties.customer_information.address.bounding_box}
              />
              <FieldItem
                label="Contact No"
                value={page.customerparties.customer_information.contact_no.value}
                boundingBox={page.customerparties.customer_information.contact_no.bounding_box}
              />
              <FieldItem
                label="Contact Person"
                value={page.customerparties.customer_information.contact_person.value}
                boundingBox={page.customerparties.customer_information.contact_person.bounding_box}
              />
              <FieldItem
                label="Email Address"
                value={page.customerparties.customer_information.email_address.value}
                boundingBox={page.customerparties.customer_information.email_address.bounding_box}
              />
            </motion.div>
          )}
        </div>

        {/* Items */}
        <div className="space-y-2 bg-card rounded-lg border p-2">
          <SectionHeader title="Items" id="items" />
          {expandedSections.has('items') && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pt-2"
            >
              {page.items.map((item, index) => (
                <motion.div
                  key={index}
                  className="p-4 rounded-lg border border-border hover:border-primary/30 cursor-pointer transition-all hover:shadow-md bg-card/50"
                  onMouseEnter={() => {
                    const ibb = normalizeBoxAny(item.bounding_box?.[0]);
                    if (ibb) onFieldHover({ ...ibb, page: ibb.page ?? page.page_number });
                  }}
                  onMouseLeave={() => onFieldHover(null)}
                >
                  <div className="text-xs font-semibold text-primary mb-3">Item {index + 1}</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Description</div>
                      <div className="text-sm font-medium truncate">{item.description || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Quantity</div>
                      <div className="text-sm font-medium">{item.quantity || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Unit Price</div>
                      <div className="text-sm font-medium">{item.unit_price || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Total</div>
                      <div className="text-sm font-medium">{item.total || '—'}</div>
                    </div>
                  </div>
                  {(() => {
                    const ibb = normalizeBoxAny(item.bounding_box?.[0]);
                    return (
                      <div className="mt-2 text-[10px] text-muted-foreground font-mono">
                        {ibb
                          ? `x:${Math.round(ibb.x)} y:${Math.round(ibb.y)} w:${Math.round(ibb.width)} h:${Math.round(ibb.height)} p:${ibb.page ?? page.page_number}`
                          : 'x:— y:— w:— h:— p:—'}
                      </div>
                    );
                  })()}
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        {/* Other Information */}
        {page.other_information.length > 0 && (
          <div className="space-y-2 bg-card rounded-lg border p-2">
            <SectionHeader title="Other Information" id="other" />
            {expandedSections.has('other') && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 pt-2"
              >
                {page.other_information.map((info, index) => (
                  <div key={index} className="space-y-2">
                    {info.additional_notes && (
                      <FieldItem
                        label="Additional Notes"
                        value={info.additional_notes.value}
                        boundingBox={info.additional_notes.bounding_box as any}
                      />
                    )}
                    {info.title && (
                      <FieldItem
                        label="Title"
                        value={info.title.value}
                        boundingBox={info.title.bounding_box as any}
                      />
                    )}
                  </div>
                ))}
              </motion.div>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}