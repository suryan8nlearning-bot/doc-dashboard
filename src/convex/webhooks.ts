"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

// Add: Helpers for allowlist and HMAC signing
const getAllowedHosts = (): Array<string> => {
  const raw =
    (process.env.WEBHOOK_ALLOW_HOSTS ?? process.env.WEBHOOK_ALLOWED_HOSTS ?? "")
      .trim();
  const list: Array<string> = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list;
};

const isLocalhostHost = (hostname: string): boolean =>
  hostname === "localhost" || hostname === "127.0.0.1";

// HMAC-SHA256 signature using Web Crypto API (Node 18+)
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const subtle: SubtleCrypto | undefined = (globalThis as any)?.crypto?.subtle;
  if (!subtle) {
    throw new Error("WebCrypto SubtleCrypto not available in this runtime");
  }
  const enc = new TextEncoder();
  const key = await subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sigBuffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

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

    // Enforce optional hostname allowlist
    const allowlist = getAllowedHosts();
    if (
      allowlist.length > 0 &&
      !allowlist.includes(parsed.hostname.toLowerCase()) &&
      !isLocalhostHost(parsed.hostname.toLowerCase())
    ) {
      return { ok: false, status: 0, error: "Webhook host is not allowed by WEBHOOK_ALLOW_HOSTS" };
    }

    // Build headers with optional HMAC signature
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Webhook-Source": "convex",
    };
    if (args.userEmail) headers["X-Webhook-User-Email"] = args.userEmail;

    const secret = process.env.WEBHOOK_SECRET;
    const timestamp = Date.now().toString();
    if (secret) {
      const signingMessage = [
        "POST",
        parsed.pathname,
        parsed.search,
        timestamp,
        JSON.stringify(body ?? {}),
      ].join("\n");
      try {
        const signature = await hmacSha256Hex(secret, signingMessage);
        headers["X-Webhook-Timestamp"] = timestamp;
        headers["X-Webhook-Signature"] = signature;
        headers["X-Webhook-Signature-Alg"] = "HMAC-SHA256";
      } catch (e) {
        console.log("[Webhook][Signing][POST][Error]", { error: String(e) });
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs ?? 15000);

    try {
      const res = await fetch(parsed.toString(), {
        method: "POST",
        headers,
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

    // Validate URL and enforce HTTPS, but allow http for localhost
    let target: URL;
    try {
      target = new URL(args.url);
    } catch {
      return {
        ok: false,
        status: 0,
        body: "Invalid webhook URL",
        url: args.url,
        method: "GET" as const,
      };
    }
    if (target.protocol !== "https:") {
      const isLocalhost =
        target.protocol === "http:" &&
        (target.hostname === "localhost" || target.hostname === "127.0.0.1");
      if (!isLocalhost) {
        return {
          ok: false,
          status: 0,
          body: "Webhook URL must use HTTPS (or http on localhost)",
          url: target.toString(),
          method: "GET" as const,
        };
      }
    }

    // Enforce optional hostname allowlist
    const allowlist = getAllowedHosts();
    if (
      allowlist.length > 0 &&
      !allowlist.includes(target.hostname.toLowerCase()) &&
      !isLocalhostHost(target.hostname.toLowerCase())
    ) {
      return {
        ok: false,
        status: 0,
        body: "Webhook host is not allowed by WEBHOOK_ALLOW_HOSTS",
        url: target.toString(),
        method: "GET" as const,
      };
    }

    // Build final URL with query params
    const url = new URL(target.toString());
    url.searchParams.set("id", args.id);
    url.searchParams.set("sap", args.sap);
    if (args.routeId) url.searchParams.set("routeId", args.routeId);
    if (args.userEmail) url.searchParams.set("userEmail", args.userEmail);
    if (args.source) url.searchParams.set("source", args.source);

    // Build headers with optional HMAC signature (no body for GET)
    const headers: Record<string, string> = {
      "X-Webhook-Source": "convex",
    };
    if (args.userEmail) headers["X-Webhook-User-Email"] = args.userEmail;

    const secret = process.env.WEBHOOK_SECRET;
    const timestamp = Date.now().toString();
    if (secret) {
      const signingMessage = ["GET", url.pathname, url.search, timestamp].join("\n");
      try {
        const signature = await hmacSha256Hex(secret, signingMessage);
        headers["X-Webhook-Timestamp"] = timestamp;
        headers["X-Webhook-Signature"] = signature;
        headers["X-Webhook-Signature-Alg"] = "HMAC-SHA256";
      } catch (e) {
        console.log("[Webhook][Signing][GET][Error]", { error: String(e) });
      }
    }

    const res = await fetch(url.toString(), { method: "GET", headers });
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