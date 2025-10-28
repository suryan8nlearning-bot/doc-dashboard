import { createClient } from '@supabase/supabase-js';

// Support both Vite-style and plain env names
const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  (import.meta.env.SUPABASE_URL as string | undefined);
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.SUPABASE_ANON_KEY as string | undefined);

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

if (!hasSupabaseEnv) {
  console.warn(
    'Supabase is not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).'
  );
}

export const supabase = hasSupabaseEnv
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : (null as unknown as ReturnType<typeof createClient>);

// Helper to build a public URL from a storage path like "bucket/path/file.pdf"
export function publicUrlForPath(path: string) {
  if (!supabaseUrl) return '';
  const base = supabaseUrl.replace(/\/$/, '');
  const normalized = String(path).replace(/^\//, '');
  return `${base}/storage/v1/object/public/${normalized}`;
}

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