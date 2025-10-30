"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

export const sendWebhook = action({
  args: {
    url: v.string(),
    // Allow forwarding arbitrary JSON payloads to the webhook
    body: v.any(),
    // Optional metadata for logging/tracking if needed
    userEmail: v.optional(v.string()),
    source: v.optional(v.string()),
    // Optional per-call timeout override (defaults to 15s)
    timeoutMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { url, body, timeoutMs } = args;

    // Validate URL and enforce HTTPS, but allow http for localhost
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, status: 0, error: "Invalid webhook URL" };
    }
    if (parsed.protocol !== "https:") {
      const isLocalhost =
        parsed.protocol === "http:" &&
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
      if (!isLocalhost) {
        return { ok: false, status: 0, error: "Webhook URL must use HTTPS (or http on localhost)" };
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs ?? 15000);

    try {
      const res = await fetch(parsed.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
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