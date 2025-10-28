import { createClient } from '@supabase/supabase-js';

// Support both Vite-style and plain env names
const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  (import.meta.env.SUPABASE_URL as string | undefined);
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.SUPABASE_ANON_KEY as string | undefined);

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

console.log('Supabase Config:', {
  hasSupabaseEnv,
  supabaseUrl: supabaseUrl ? 'configured' : 'missing',
  supabaseAnonKey: supabaseAnonKey ? 'configured' : 'missing',
});

if (!hasSupabaseEnv) {
  console.warn(
    'Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the API keys tab.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

// Export the URL separately for building public URLs
export const supabasePublicUrl = supabaseUrl || '';

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