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
    // NEW: support GET or POST (default POST)
    method: v.optional(v.union(v.literal("GET"), v.literal("POST"))),
  },
  handler: async (ctx, args) => {
    const { url, body, timeoutMs, method } = args;

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
      const methodToUse = (method ?? "POST") as "GET" | "POST";

      if (methodToUse === "GET") {
        // Build a URL with query params from the provided body
        const target = new URL(url);
        // Extract known fields if present
        const candidate: any = body ?? {};
        const docId = candidate?.docId ?? null;
        const routeId = candidate?.routeId ?? null;
        // If a nested payload exists, use it; otherwise use entire body as payload
        const payload = "payload" in (candidate ?? {}) ? candidate.payload : candidate;

        if (docId !== null && docId !== undefined) {
          target.searchParams.set("docId", String(docId));
        }
        if (routeId !== null && routeId !== undefined) {
          target.searchParams.set("routeId", String(routeId));
        }
        // Always include the payload as JSON string
        target.searchParams.set("payload", JSON.stringify(payload ?? {}));

        const res = await fetch(target.toString(), {
          method: "GET",
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const text = await res.text().catch(() => "");
        if (!res.ok) {
          return {
            ok: false,
            status: res.status,
            error: text || `HTTP ${res.status}`,
          };
        }
        return { ok: true, status: res.status, responseText: text || null };
      }

      // Default POST behavior
      const res = await fetch(new URL(url).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const text = await res.text().catch(() => "");
      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          error: text || `HTTP ${res.status}`,
        };
      }
      return { ok: true, status: res.status, responseText: text || null };
    } catch (e: any) {
      if (e?.name === "AbortError") {
        return { ok: false, status: 0, error: "Request timed out (15s)" };
      }
      return { ok: false, status: 0, error: e?.message || "Network error" };
    }
  },
});