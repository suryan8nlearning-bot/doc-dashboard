import { motion } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { ScrollArea } from './ui/scroll-area';
import type { BoundingBox, DocumentData } from '@/lib/supabase';

interface DocumentFieldsProps {
  documentData: DocumentData;
  onFieldHover: (box: BoundingBox | null) => void;
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
      whileHover={{ backgroundColor: 'rgba(0, 0, 0, 0.02)' }}
      className="py-3 px-4 cursor-pointer rounded-md transition-colors"
      onMouseEnter={() => boundingBox?.[0] && onFieldHover(boundingBox[0])}
      onMouseLeave={() => onFieldHover(null)}
    >
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-sm font-medium">{value || '—'}</div>
    </motion.div>
  );

  const SectionHeader = ({ title, id }: { title: string; id: string }) => {
    const isExpanded = expandedSections.has(id);
    return (
      <button
        onClick={() => toggleSection(id)}
        className="flex items-center justify-between w-full py-3 px-4 hover:bg-muted/50 transition-colors rounded-md"
      >
        <h3 className="font-semibold text-sm">{title}</h3>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>
    );
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        {/* Metadata Section */}
        <div className="space-y-2">
          <SectionHeader title="Document Metadata" id="metadata" />
          {expandedSections.has('metadata') && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-1"
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
        <div className="space-y-2">
          <SectionHeader title="Vendor Information" id="vendor" />
          {expandedSections.has('vendor') && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-1"
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
        <div className="space-y-2">
          <SectionHeader title="Customer Information" id="customer" />
          {expandedSections.has('customer') && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-1"
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
        <div className="space-y-2">
          <SectionHeader title="Items" id="items" />
          {expandedSections.has('items') && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4"
            >
              {page.items.map((item, index) => (
                <motion.div
                  key={index}
                  whileHover={{ backgroundColor: 'rgba(0, 0, 0, 0.02)' }}
                  className="p-4 rounded-md border cursor-pointer"
                  onMouseEnter={() => item.bounding_box[0] && onFieldHover(item.bounding_box[0])}
                  onMouseLeave={() => onFieldHover(null)}
                >
                  <div className="text-xs text-muted-foreground mb-2">Item {index + 1}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground">Description</div>
                      <div className="text-sm font-medium">{item.description || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Quantity</div>
                      <div className="text-sm font-medium">{item.quantity || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Unit Price</div>
                      <div className="text-sm font-medium">{item.unit_price || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Total</div>
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
          <div className="space-y-2">
            <SectionHeader title="Other Information" id="other" />
            {expandedSections.has('other') && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-1"
              >
                {page.other_information.map((info, index) => (
                  <div key={index}>
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
