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

export const sendSapPayload = action({
  args: {
    url: v.string(),
    docId: v.string(),
    payload: v.any(),
    userEmail: v.optional(v.string()),
    source: v.optional(v.string()),
    timeoutMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let parsed: URL;
    try {
      parsed = new URL(args.url);
    } catch {
      throw new Error("Invalid webhook URL");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("Webhook URL must use HTTPS");
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.max(1000, Math.min(60000, args.timeoutMs ?? 15000))
    );

    try {
      const res = await fetch(parsed.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: args.docId,
          sap: args.payload,
          userEmail: args.userEmail ?? "",
          source: args.source ?? "landing",
          timestamp: new Date().toISOString(),
        }),
        signal: controller.signal,
      });

      const text = await res.text().catch(() => "");
      if (!res.ok) {
        return { ok: false as const, status: res.status, error: text.slice(0, 512) };
      }
      return { ok: true as const, status: res.status, body: text.slice(0, 2048) };
    } catch (e: any) {
      if (e?.name === "AbortError") {
        return { ok: false as const, status: 0, error: "Request timed out" };
      }
      return { ok: false as const, status: 0, error: String(e?.message ?? e) };
    } finally {
      clearTimeout(timeout);
    }
  },
});