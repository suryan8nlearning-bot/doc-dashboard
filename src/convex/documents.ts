"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";

/**
 * Fetch a PDF from Supabase and return it as a base64 string
 * This bypasses CORS and browser blocking issues
 */
export const fetchPdfProxy = action({
  args: {
    pdfUrl: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      console.log('Backend: Fetching PDF from:', args.pdfUrl);
      
      const response = await fetch(args.pdfUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/pdf',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');

      console.log('Backend: PDF fetched successfully, size:', buffer.length, 'bytes');

      return {
        success: true,
        data: base64,
        contentType: response.headers.get('content-type') || 'application/pdf',
        size: buffer.length,
      };
    } catch (error) {
      console.error('Backend: PDF proxy error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});