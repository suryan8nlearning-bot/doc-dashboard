import { motion } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { ScrollArea } from './ui/scroll-area';
import type { BoundingBox, DocumentData } from '@/lib/supabase';

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
    boundingBox?: BoundingBox[];
  }) => (
    <motion.div
      className="py-3 px-4 cursor-pointer rounded-lg transition-all border bg-card/50 hover:bg-primary/5 hover:border-primary/30 hover:shadow-md"
      // Include page number with the first bounding box for accurate page switching
      onMouseEnter={() =>
        boundingBox?.[0] &&
        onFieldHover({ ...boundingBox[0], page: page.page_number })
      }
      onMouseLeave={() => onFieldHover(null)}
    >
      <div className="text-xs font-medium text-muted-foreground mb-1.5">{label}</div>
      <div className="text-sm font-medium text-foreground truncate">{value || '—'}</div>
    </motion.div>
  );

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
                  onMouseEnter={() =>
                    item.bounding_box[0] &&
                    onFieldHover({ ...item.bounding_box[0], page: page.page_number })
                  }
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
                        boundingBox={info.additional_notes.bounding_box}
                      />
                    )}
                    {info.title && (
                      <FieldItem
                        label="Title"
                        value={info.title.value}
                        boundingBox={info.title.bounding_box}
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