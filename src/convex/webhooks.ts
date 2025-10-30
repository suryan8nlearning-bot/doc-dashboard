"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

export const sendWebhook = action({
  args: {
    url: v.string(),
    documentIds: v.array(v.string()),
    userEmail: v.string(),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    const { url, documentIds, userEmail, source } = args;

    // Validate URL and enforce HTTPS
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, status: 0, error: "Invalid webhook URL" };
    }
    if (parsed.protocol !== "https:") {
      return { ok: false, status: 0, error: "Webhook URL must use HTTPS" };
    }

    const payload = {
      documentIds,
      user: userEmail,
      source,
      timestamp: new Date().toISOString(),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(parsed.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          ok: false,
          status: res.status,
          error: text || `HTTP ${res.status}`,
        };
      }
      return { ok: true, status: res.status };
    } catch (e: any) {
      if (e?.name === "AbortError") {
        return { ok: false, status: 0, error: "Request timed out (15s)" };
      }
      return { ok: false, status: 0, error: e?.message || "Network error" };
    }
  },
});
