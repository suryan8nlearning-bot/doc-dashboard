import { motion } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { ScrollArea } from './ui/scroll-area';
import type { BoundingBox, DocumentData } from '@/lib/supabase';

// Add: section color palette (hex for stable use in PDF overlay)
const SECTION_COLORS: Record<string, string> = {
  metadata: '#10b981', // emerald
  vendor: '#8b5cf6',   // violet
  customer: '#f59e0b', // amber
  items: '#0ea5e9',    // sky
  other: '#f43f5e',    // rose
};

/**
 * Normalize bounding boxes.
 * IMPORTANT: Arrays are strictly interpreted as [x1, y1, x2, y2, (page?)].
 * Objects prefer explicit edges x1/y1/x2/y2; fall back to x/y/width/height.
 */
function normalizeBoxAny(input: any): (BoundingBox & { page?: number }) | null {
  if (!input) return null;

  const toNum = (v: any) => (v === null || v === undefined || v === '' ? NaN : Number(v));

  // Strict: arrays are edges [x1, y1, x2, y2, (page?)]
  if (Array.isArray(input)) {
    if (input.length < 4) return null;
    let x1 = toNum(input[0]);
    let y1 = toNum(input[1]);
    let x2 = toNum(input[2]);
    let y2 = toNum(input[3]);
    const page = toNum(input[4]);

    if (![x1, y1, x2, y2].every(Number.isFinite)) return null;

    if (x2 < x1) [x1, x2] = [x2, x1];
    if (y2 < y1) [y1, y2] = [y2, y1];

    const width = x2 - x1;
    const height = y2 - y1;
    if (width <= 0 || height <= 0) return null;

    return { x: x1, y: y1, width, height, page: Number.isFinite(page) ? page : undefined };
  }

  // Objects: prefer explicit edges first
  let x1 = toNum(input.x1 ?? input.left ?? input.minX);
  let y1 = toNum(input.y1 ?? input.top ?? input.minY);
  let x2 = toNum(input.x2 ?? input.right ?? input.maxX);
  let y2 = toNum(input.y2 ?? input.bottom ?? input.maxY);

  const rawPage = input.page ?? input.page_number ?? input.pageIndex ?? input.p;
  const page = toNum(rawPage);

  if ([x1, y1, x2, y2].every(Number.isFinite)) {
    if (x2 < x1) [x1, x2] = [x2, x1];
    if (y2 < y1) [y1, y2] = [y2, y1];
    const width = x2 - x1;
    const height = y2 - y1;
    if (width > 0 && height > 0) {
      return { x: x1, y: y1, width, height, page: Number.isFinite(page) ? page : undefined };
    }
  }

  // Fallback: x/y/width/height or derive from right/bottom
  const x = toNum(input.x ?? input.x0 ?? input.startX ?? input.left);
  const y = toNum(input.y ?? input.y0 ?? input.startY ?? input.top);
  let width = toNum(input.width ?? input.w);
  let height = toNum(input.height ?? input.h);

  if (!Number.isFinite(width) && Number.isFinite(x) && Number.isFinite(x2)) width = x2 - x;
  if (!Number.isFinite(height) && Number.isFinite(y) && Number.isFinite(y2)) height = y2 - y;

  if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) {
    return { x, y, width, height, page: Number.isFinite(page) ? page : undefined };
  }
  return null;
}

interface DocumentFieldsProps {
  documentData: DocumentData;
  onFieldHover: (box: (BoundingBox & { page?: number; color?: string }) | null) => void;
}

export function DocumentFields({ documentData, onFieldHover }: DocumentFieldsProps) {
  // Collapse all sections by default
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const showDebug = false; // Hide debug lines by default for a cleaner UI

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
    // Add: optional color to paint the left border and highlight overlay
    color,
  }: {
    label: string;
    value: string;
    boundingBox?: any[];
    color?: string;
  }) => {
    const bb = normalizeBoxAny(boundingBox?.[0]);
    const dbg = bb
      ? `x:${Math.round(bb.x)} y:${Math.round(bb.y)} w:${Math.round(bb.width)} h:${Math.round(bb.height)} p:${bb.page ?? page.page_number}`
      : 'x:— y:— w:— h:— p:—';

    // Add: raw bounding box debug helpers
    const boxesCount = Array.isArray(boundingBox) ? boundingBox.length : 0;
    let rawLabel = '[]';
    try {
      rawLabel = boxesCount > 0 ? JSON.stringify(boundingBox![0]) : '[]';
    } catch {
      rawLabel = '[unserializable]';
    }

    return (
      <motion.div
        className="py-2.5 px-3 cursor-pointer rounded-lg transition-all border bg-card/50 hover:bg-primary/5 hover:border-primary/30 hover:shadow-sm border-l-2"
        // Add: colorize left border and pass color to PDF hover
        style={{ borderLeftColor: color || 'transparent' }}
        onMouseEnter={() =>
          bb && onFieldHover({ ...bb, page: bb.page ?? page.page_number, ...(color ? { color } : {}) })
        }
        onMouseLeave={() => onFieldHover(null)}
      >
        <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-2">
          {/* Add: small color dot */}
          {color && <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
          {label}
        </div>
        <div className="text-sm font-medium text-foreground break-words whitespace-pre-wrap">{value || '—'}</div>
        {showDebug && (
          <div className="mt-1 text-[10px] text-muted-foreground font-mono">{dbg}</div>
        )}
        {/* New: show raw bounding_box for debugging */}
        {showDebug && (
          <div className="mt-0.5 text-[10px] text-muted-foreground font-mono break-all">
            bbox: {rawLabel} {boxesCount > 1 ? `(total ${boxesCount})` : ''}
          </div>
        )}
      </motion.div>
    );
  };

  const SectionHeader = ({ title, id, color }: { title: string; id: string; color?: string }) => {
    const isExpanded = expandedSections.has(id);
    return (
      <button
        onClick={() => toggleSection(id)}
        className="flex items-center justify-between w-full py-2.5 px-3 hover:bg-muted/50 transition-colors rounded-lg group"
      >
        <div className="flex items-center gap-2">
          {color && <span className="inline-block h-3 w-1.5 rounded-sm" style={{ backgroundColor: color }} />}
          <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">{title}</h3>
        </div>
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
      <div className="p-4 space-y-2">
        {/* Metadata Section */}
        <div className="space-y-1.5 bg-card rounded-lg border p-2">
          <SectionHeader title="Document Metadata" id="metadata" color={SECTION_COLORS.metadata} />
          {expandedSections.has('metadata') && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1 pt-1"
            >
              <FieldItem
                label="Document Title"
                value={page.metadata.document_title.value}
                boundingBox={page.metadata.document_title.bounding_box}
                color={SECTION_COLORS.metadata}
              />
              <FieldItem
                label="Date"
                value={page.metadata.date.value}
                boundingBox={page.metadata.date.bounding_box}
                color={SECTION_COLORS.metadata}
              />
              <FieldItem
                label="Purchase Order No"
                value={page.metadata.purchase_order_no.value}
                boundingBox={page.metadata.purchase_order_no.bounding_box}
                color={SECTION_COLORS.metadata}
              />
            </motion.div>
          )}
        </div>

        {/* Vendor Information */}
        <div className="space-y-1.5 bg-card rounded-lg border p-2">
          <SectionHeader title="Vendor Information" id="vendor" color={SECTION_COLORS.vendor} />
          {expandedSections.has('vendor') && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1 pt-1"
            >
              <FieldItem
                label="Vendor Name"
                value={page.parties.vendor_information.vendor_name.value}
                boundingBox={page.parties.vendor_information.vendor_name.bounding_box}
                color={SECTION_COLORS.vendor}
              />
              <FieldItem
                label="Address"
                value={page.parties.vendor_information.address.value}
                boundingBox={page.parties.vendor_information.address.bounding_box}
                color={SECTION_COLORS.vendor}
              />
              <FieldItem
                label="Contact No"
                value={page.parties.vendor_information.contact_no.value}
                boundingBox={page.parties.vendor_information.contact_no.bounding_box}
                color={SECTION_COLORS.vendor}
              />
              <FieldItem
                label="Sales Person"
                value={page.parties.vendor_information.sales_person.value}
                boundingBox={page.parties.vendor_information.sales_person.bounding_box}
                color={SECTION_COLORS.vendor}
              />
            </motion.div>
          )}
        </div>

        {/* Customer Information */}
        <div className="space-y-1.5 bg-card rounded-lg border p-2">
          <SectionHeader title="Customer Information" id="customer" color={SECTION_COLORS.customer} />
          {expandedSections.has('customer') && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1 pt-1"
            >
              <FieldItem
                label="Customer Name"
                value={page.customerparties.customer_information.customer_name.value}
                boundingBox={page.customerparties.customer_information.customer_name.bounding_box}
                color={SECTION_COLORS.customer}
              />
              <FieldItem
                label="Address"
                value={page.customerparties.customer_information.address.value}
                boundingBox={page.customerparties.customer_information.address.bounding_box}
                color={SECTION_COLORS.customer}
              />
              <FieldItem
                label="Contact No"
                value={page.customerparties.customer_information.contact_no.value}
                boundingBox={page.customerparties.customer_information.contact_no.bounding_box}
                color={SECTION_COLORS.customer}
              />
              <FieldItem
                label="Contact Person"
                value={page.customerparties.customer_information.contact_person.value}
                boundingBox={page.customerparties.customer_information.contact_person.bounding_box}
                color={SECTION_COLORS.customer}
              />
              <FieldItem
                label="Email Address"
                value={page.customerparties.customer_information.email_address.value}
                boundingBox={page.customerparties.customer_information.email_address.bounding_box}
                color={SECTION_COLORS.customer}
              />
            </motion.div>
          )}
        </div>

        {/* Items */}
        <div className="space-y-1.5 bg-card rounded-lg border p-2">
          <SectionHeader title="Items" id="items" color={SECTION_COLORS.items} />
          {expandedSections.has('items') && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="grid gap-2 pt-1"
            >
              {page.items.map((item, index) => (
                <motion.div
                  key={index}
                  className="p-3 rounded-lg border border-border hover:border-primary/30 cursor-pointer transition-all hover:shadow-sm bg-card/50 border-l-2"
                  style={{ borderLeftColor: SECTION_COLORS.items }}
                  onMouseEnter={() => {
                    const ibb = normalizeBoxAny(item.bounding_box?.[0]);
                    if (ibb) onFieldHover({ ...ibb, page: ibb.page ?? page.page_number, color: SECTION_COLORS.items });
                  }}
                  onMouseLeave={() => onFieldHover(null)}
                >
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1 whitespace-pre-wrap break-words">Description</div>
                      <div className="text-sm font-medium whitespace-pre-wrap break-words">
                        {item.description || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1 whitespace-pre-wrap break-words">Quantity</div>
                      <div className="text-sm font-medium whitespace-pre-wrap break-words">
                        {item.quantity || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1 whitespace-pre-wrap break-words">Unit Price</div>
                      <div className="text-sm font-medium whitespace-pre-wrap break-words">
                        {item.unit_price || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1 whitespace-pre-wrap break-words">Total</div>
                      <div className="text-sm font-medium whitespace-pre-wrap break-words">
                        {item.total || '—'}
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const ibb = normalizeBoxAny(item.bounding_box?.[0]);
                    return (
                      <>
                        {showDebug && (
                          <div className="mt-2 text-[10px] text-muted-foreground font-mono">
                            {ibb
                              ? `x:${Math.round(ibb.x)} y:${Math.round(ibb.y)} w:${Math.round(ibb.width)} h:${Math.round(ibb.height)} p:${ibb.page ?? page.page_number}`
                              : 'x:— y:— w:— h:— p:—'}
                          </div>
                        )}
                        {/* New: raw bbox debug for items */}
                        {showDebug && (
                          <div className="mt-0.5 text-[10px] text-muted-foreground font-mono break-all">
                            bbox: {Array.isArray(item.bounding_box) && item.bounding_box.length > 0 ? (() => {
                              try { return JSON.stringify(item.bounding_box[0]); } catch { return '[unserializable]'; }
                            })() : '[]'}
                            {Array.isArray(item.bounding_box) && item.bounding_box.length > 1 ? ` (total ${item.bounding_box.length})` : ''}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        {/* Other Information */}
        {page.other_information.length > 0 && (
          <div className="space-y-1.5 bg-card rounded-lg border p-2">
            <SectionHeader title="Other Information" id="other" color={SECTION_COLORS.other} />
            {expandedSections.has('other') && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1"
                style={{ overflow: 'visible' }}
              >
                {page.other_information.map((info, index) => (
                  <div key={index} className="space-y-1.5">
                    {info.additional_notes && (
                      <FieldItem
                        label="Additional Notes"
                        value={info.additional_notes.value}
                        boundingBox={info.additional_notes.bounding_box as any}
                        color={SECTION_COLORS.other}
                      />
                    )}
                    {info.title && (
                      <FieldItem
                        label="Title"
                        value={info.title.value}
                        boundingBox={info.title.bounding_box as any}
                        color={SECTION_COLORS.other}
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