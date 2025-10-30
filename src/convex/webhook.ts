"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

export const send = action({
  args: {
    url: v.string(),
    documentIds: v.array(v.string()),
    user: v.string(),
    source: v.string(),
    timestamp: v.string(),
  },
  handler: async (ctx, args) => {
    let url: URL;
    try {
      url = new URL(args.url);
    } catch {
      throw new Error("Invalid webhook URL");
    }
    if (url.protocol !== "https:") {
      throw new Error("Webhook URL must use HTTPS");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentIds: args.documentIds,
          user: args.user,
          source: args.source,
          timestamp: args.timestamp,
        }),
        signal: controller.signal,
      });

      const text = await res.text().catch(() => "");
      if (!res.ok) {
        throw new Error(`Webhook returned status ${res.status}: ${text.slice(0, 200)}`);
      }
      return { ok: true as const, status: res.status, body: text.slice(0, 2048) };
    } catch (e: any) {
      if (e?.name === "AbortError") {
        throw new Error("Webhook request timed out (15s).");
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  },
});
