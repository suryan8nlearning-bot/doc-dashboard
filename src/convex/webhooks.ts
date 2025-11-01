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
    // Log request (full JSON payload)
    try {
      console.log("[Webhook][Request][POST]", {
        url: args.url,
        userEmail: args.userEmail ?? null,
        source: args.source ?? null,
        docId: args.body?.docId ?? null,
        routeId: args.body?.routeId ?? null,
        payload: args.body?.payload ?? null,
      });
    } catch (e) {
      console.log("[Webhook][Request][POST][LogError]", { error: String(e) });
    }

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

      // Read response text for logging and error reporting
      let text = "";
      try {
        text = await res.text();
      } catch {
        text = "";
      }

      // Response logging (POST)
      try {
        console.log("[Webhook][Response][POST]", {
          url: args.url,
          status: res.status,
          ok: res.ok,
          body: text,
        });
      } catch (e) {
        console.log("[Webhook][Response][POST][LogError]", { error: String(e) });
      }

      if (!res.ok) {
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

export const sendWebhookGet = action({
  // New GET webhook action that sends id and full sap JSON in the query string
  args: {
    url: v.string(),
    id: v.string(),
    sap: v.string(),
    routeId: v.optional(v.string()),
    userEmail: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Fix request logging to reflect GET args (no args.body here)
    try {
      console.log("[Webhook][Request][GET]", {
        url: args.url,
        userEmail: args.userEmail ?? null,
        source: args.source ?? null,
        id: args.id,
        routeId: args.routeId ?? null,
        sap: args.sap, // full JSON string sent in query
      });
    } catch (e) {
      console.log("[Webhook][Request][GET][LogError]", { error: String(e) });
    }

    const url = new URL(args.url);
    url.searchParams.set("id", args.id);
    url.searchParams.set("sap", args.sap);
    if (args.routeId) url.searchParams.set("routeId", args.routeId);
    if (args.userEmail) url.searchParams.set("userEmail", args.userEmail);
    if (args.source) url.searchParams.set("source", args.source);

    const res = await fetch(url.toString(), { method: "GET" });
    const text = await res.text().catch(() => "");

    // Response logging (GET)
    try {
      console.log("[Webhook][Response][GET]", {
        url: url.toString(),
        status: res.status,
        ok: res.ok,
        body: text,
      });
    } catch (e) {
      console.log("[Webhook][Response][GET][LogError]", { error: String(e) });
    }

    return {
      ok: res.ok,
      status: res.status,
      body: text,
      url: url.toString(),
      method: "GET" as const,
    };
  },
});