import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FieldValue {
  value: string;
  bounding_box: BoundingBox[];
}

export interface Item {
  description: string;
  quantity: string;
  unit_price: string;
  total: string;
  bounding_box: BoundingBox[];
}

export interface DocumentData {
  document: {
    pages: Array<{
      page_number: number;
      metadata: {
        document_title: FieldValue;
        date: FieldValue;
        purchase_order_no: FieldValue;
      };
      parties: {
        vendor_information: {
          vendor_name: FieldValue;
          address: FieldValue;
          contact_no: FieldValue;
          sales_person: FieldValue;
        };
      };
      customerparties: {
        customer_information: {
          customer_name: FieldValue;
          address: FieldValue;
          contact_no: FieldValue;
          contact_person: FieldValue;
          email_address: FieldValue;
        };
      };
      items: Item[];
      other_information: Array<{
        additional_notes?: FieldValue;
        title?: FieldValue;
      }>;
    }>;
  };
}

export interface DocumentRecord {
  id: string;
  document_data: DocumentData;
  pdf_url: string;
  created_at: string;
}
