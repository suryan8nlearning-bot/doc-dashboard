import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { motion } from 'framer-motion';
import { ArrowRight, FileText, Loader2, Search, Zap, User } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { useLocation } from 'react-router';
import { supabase, hasSupabaseEnv } from '@/lib/supabase';
import { toast } from 'sonner';
import Ajv, { type ErrorObject } from "ajv";
import { salesOrderCreateSchema } from "@/schemas/salesOrderCreate";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function Landing() {
  const { isLoading, isAuthenticated, user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [docId, setDocId] = useState<string>('');
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [showSap, setShowSap] = useState<boolean>(true);
  const [rawJson, setRawJson] = useState<string>('');
  const [sapJson, setSapJson] = useState<string>('');
  const [editorValue, setEditorValue] = useState<string>('');
  const [isRowLoading, setIsRowLoading] = useState<boolean>(false);
  // Add saving/creating states
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<ErrorObject[] | null>(null);
  const [isValid, setIsValid] = useState<boolean | null>(null);

  // Add online/offline detection for error banner
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // Add: read ?id= from URL
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const idParam = params.get('id');
      if (idParam) setDocId(idParam);
    } catch {}
  }, [location.search]);

  // Add: fetch row from Supabase when id present
  useEffect(() => {
    const load = async () => {
      if (!docId || !hasSupabaseEnv) return;
      setIsRowLoading(true);
      try {
        const { data, error } = await supabase
          .from('N8N Logs')
          .select('*')
          .eq('id', docId)
          .single();
        if (error) throw error;

        let current = '';
        const candidates = [data?.pdf_ai_output, data?.document_data];
        for (const c of candidates) {
          if (!c) continue;
          try {
            current = typeof c === 'string' ? c : JSON.stringify(c, null, 2);
            break;
          } catch {}
        }

        // Prefer SAP JSON saved from the app first, then fall back to SAP_AI_OUTPUT
        const appSapCandidates: any[] = [
          data?.SAP_JSON_FROM_APP,
          data?.sap_json_from_app,
          data?.['SAP JSON from app'],
          data?.sap_json_app,
          data?.sap_app_json,
        ];
        let appSap: any = undefined;
        for (const c of appSapCandidates) {
          if (c !== undefined && c !== null && String(c).trim() !== '') {
            appSap = c;
            break;
          }
        }
        const sapSource = appSap ?? data?.SAP_AI_OUTPUT;

        const sap =
          sapSource
            ? (typeof sapSource === 'string'
                ? sapSource
                : JSON.stringify(sapSource, null, 2))
            : '{\n  "output": {\n    "to_Item": []\n  }\n}';

        setRawJson(current);
        const orderedSap = (() => {
          try {
            const p = JSON.parse(sap);
            return JSON.stringify(reorderSapPayload(p), null, 2);
          } catch {
            return sap;
          }
        })();
        setSapJson(orderedSap);
        setEditorValue(showSap ? orderedSap : current);
      } catch (e: any) {
        console.error('Failed to load row', e);
        toast.error(`Failed to load row: ${e?.message || e}`);
      } finally {
        setIsRowLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, hasSupabaseEnv]);

  // Add: sync editor when toggling view
  useEffect(() => {
    setEditorValue(showSap ? sapJson : rawJson);
  }, [showSap, sapJson, rawJson]);

  // Initialize AJV validator once
  const ajv = new Ajv({ allErrors: true, coerceTypes: true, useDefaults: true });
  // Add custom date format: YYYY-MM-DDT00:00:00
  ajv.addFormat("ymdT00", /^\d{4}-\d{2}-\d{2}T00:00:00$/);
  const validateSalesOrder = ajv.compile(salesOrderCreateSchema);

  // Add: helpers to arrange fields by schema order
  const reorderSapPayload = (payload: any) => {
    try {
      if (!payload || typeof payload !== "object") return payload;
      const output = payload.output;
      if (!output || typeof output !== "object") return payload;

      const headerSchemaProps = salesOrderCreateSchema?.properties?.output?.properties || {};
      const headerOrder: string[] = Object.keys(headerSchemaProps);

      const orderObjectByKeys = (obj: any, keysInOrder: string[]) => {
        if (!obj || typeof obj !== "object") return obj;
        const next: any = {};
        // Add known keys in order
        for (const k of keysInOrder) {
          if (Object.prototype.hasOwnProperty.call(obj, k)) {
            next[k] = obj[k];
          }
        }
        // Append any extra keys not in schema, alphabetically
        const remaining = Object.keys(obj).filter((k) => !keysInOrder.includes(k)).sort();
        for (const k of remaining) {
          next[k] = obj[k];
        }
        return next;
      };

      // Reorder header
      const orderedOutput: any = orderObjectByKeys(output, headerOrder);

      // Reorder header partners
      const partnerItemSchemaProps = headerSchemaProps?.to_Partner?.items?.properties || {};
      const partnerOrder: string[] = Object.keys(partnerItemSchemaProps);
      if (Array.isArray(orderedOutput.to_Partner)) {
        orderedOutput.to_Partner = orderedOutput.to_Partner.map((p: any) =>
          orderObjectByKeys(p, partnerOrder)
        );
      }

      // Reorder header pricing
      const pricingItemSchemaProps = headerSchemaProps?.to_PricingElement?.items?.properties || {};
      const pricingOrder: string[] = Object.keys(pricingItemSchemaProps);
      if (Array.isArray(orderedOutput.to_PricingElement)) {
        orderedOutput.to_PricingElement = orderedOutput.to_PricingElement.map((pe: any) =>
          orderObjectByKeys(pe, pricingOrder)
        );
      }

      // Reorder items and nested arrays
      const itemSchemaProps = headerSchemaProps?.to_Item?.items?.properties || {};
      const itemOrder: string[] = Object.keys(itemSchemaProps);
      const itemPartnerItemSchemaProps = itemSchemaProps?.to_ItemPartner?.items?.properties || {};
      const itemPartnerOrder: string[] = Object.keys(itemPartnerItemSchemaProps);
      const itemPricingItemSchemaProps =
        itemSchemaProps?.to_ItemPricingElement?.items?.properties || {};
      const itemPricingOrder: string[] = Object.keys(itemPricingItemSchemaProps);

      if (Array.isArray(orderedOutput.to_Item)) {
        orderedOutput.to_Item = orderedOutput.to_Item.map((it: any) => {
          const orderedItem = orderObjectByKeys(it, itemOrder);
          if (Array.isArray(orderedItem.to_ItemPartner)) {
            orderedItem.to_ItemPartner = orderedItem.to_ItemPartner.map((ip: any) =>
              orderObjectByKeys(ip, itemPartnerOrder)
            );
          }
          if (Array.isArray(orderedItem.to_ItemPricingElement)) {
            orderedItem.to_ItemPricingElement = orderedItem.to_ItemPricingElement.map((ipr: any) =>
              orderObjectByKeys(ipr, itemPricingOrder)
            );
          }
          return orderedItem;
        });
      }

      return { ...payload, output: orderedOutput };
    } catch {
      return payload;
    }
  };

  // Add: coerce values by schema types (numbers/integers/booleans)
  const coerceSapBySchema = (payload: any) => {
    try {
      if (!payload || typeof payload !== "object") return payload;
      const output = payload.output;
      if (!output || typeof output !== "object") return payload;

      const headerSchemaProps = salesOrderCreateSchema?.properties?.output?.properties || {};
      const partnerItemSchemaProps = headerSchemaProps?.to_Partner?.items?.properties || {};
      const pricingItemSchemaProps = headerSchemaProps?.to_PricingElement?.items?.properties || {};
      const itemSchemaProps = headerSchemaProps?.to_Item?.items?.properties || {};
      const itemPartnerItemSchemaProps = itemSchemaProps?.to_ItemPartner?.items?.properties || {};
      const itemPricingItemSchemaProps = itemSchemaProps?.to_ItemPricingElement?.items?.properties || {};

      const includesType = (typeDef: any, t: string) => {
        if (!typeDef) return false;
        if (typeof typeDef === "string") return typeDef === t;
        if (Array.isArray(typeDef)) return typeDef.includes(t);
        return false;
      };

      const isNumericString = (val: any) =>
        typeof val === "string" && /^-?\d+(\.\d+)?$/.test(val.trim());

      const coerceValueToSchemaType = (val: any, typeDef: any) => {
        // integers and numbers
        if (includesType(typeDef, "integer") || includesType(typeDef, "number")) {
          if (typeof val === "number") return val;
          if (isNumericString(val)) return Number(val);
          return val;
        }
        // booleans
        if (includesType(typeDef, "boolean")) {
          if (typeof val === "boolean") return val;
          if (typeof val === "string") {
            const s = val.trim().toLowerCase();
            if (s === "true" || s === "1") return true;
            if (s === "false" || s === "0") return false;
          }
          return val;
        }
        return val;
      };

      const coerceObjectByProps = (obj: any, props: Record<string, any>) => {
        if (!obj || typeof obj !== "object") return obj;
        const out: any = { ...obj };
        for (const [k, v] of Object.entries(out)) {
          const propSchema = (props as any)[k];
          if (propSchema && "type" in propSchema) {
            out[k] = coerceValueToSchemaType(v, (propSchema as any).type);
          }
        }
        return out;
      };

      const next: any = { ...payload, output: { ...output } };

      // Header fields
      next.output = coerceObjectByProps(next.output, headerSchemaProps);

      // Header partners
      if (Array.isArray(next.output.to_Partner)) {
        next.output.to_Partner = next.output.to_Partner.map((p: any) =>
          coerceObjectByProps(p, partnerItemSchemaProps)
        );
      }

      // Header pricing
      if (Array.isArray(next.output.to_PricingElement)) {
        next.output.to_PricingElement = next.output.to_PricingElement.map((pe: any) =>
          coerceObjectByProps(pe, pricingItemSchemaProps)
        );
      }

      // Items + nested
      if (Array.isArray(next.output.to_Item)) {
        next.output.to_Item = next.output.to_Item.map((it: any) => {
          const coercedItem = coerceObjectByProps(it, itemSchemaProps);
          if (Array.isArray(coercedItem.to_ItemPartner)) {
            coercedItem.to_ItemPartner = coercedItem.to_ItemPartner.map((ip: any) =>
              coerceObjectByProps(ip, itemPartnerItemSchemaProps)
            );
          }
          if (Array.isArray(coercedItem.to_ItemPricingElement)) {
            coercedItem.to_ItemPricingElement = coercedItem.to_ItemPricingElement.map((ipr: any) =>
              coerceObjectByProps(ipr, itemPricingItemSchemaProps)
            );
          }
          return coercedItem;
        });
      }

      return next;
    } catch {
      return payload;
    }
  };

  // Validate helper
  const runValidation = (jsonStr: string): boolean => {
    try {
      const parsed = JSON.parse(jsonStr || "{}");
      const ok = validateSalesOrder(parsed) as boolean;
      setIsValid(ok);
      setValidationErrors(ok ? null : (validateSalesOrder.errors as ErrorObject[] | null));
      return ok;
    } catch {
      setIsValid(false);
      setValidationErrors([
        {
          instancePath: "",
          keyword: "parse",
          message: "Invalid JSON",
          params: {},
          schemaPath: "",
        } as any,
      ]);
      return false;
    }
  };

  // Re-validate whenever SAP editor changes
  useEffect(() => {
    runValidation(editorValue);
  }, [editorValue]);

  // Apply theme from user profile on this page + persist to localStorage and fallback to stored theme
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (theme: string) => {
      root.classList.remove('dark', 'glass-theme');
      if (theme === 'glass') {
        root.classList.add('glass-theme');
      } else if (theme === 'dark') {
        root.classList.add('dark');
      }
    };
    if (user?.theme) {
      try {
        localStorage.setItem('theme', user.theme);
      } catch {}
      applyTheme(user.theme);
    } else {
      try {
        const stored = localStorage.getItem('theme');
        if (stored) applyTheme(stored);
      } catch {}
    }
  }, [user?.theme]);

  // Quick-add helpers
  const updateSapJson = (updater: (obj: any) => void) => {
    try {
      const obj = JSON.parse(sapJson || "{}");
      if (typeof obj.output !== "object" || obj.output === null) obj.output = {};
      updater(obj);
      // Arrange by schema order after updates
      const ordered = reorderSapPayload(obj);
      const pretty = JSON.stringify(ordered, null, 2);
      setSapJson(pretty);
      if (showSap) setEditorValue(pretty);
    } catch {
      toast.error("Current SAP JSON is invalid; cannot modify.");
    }
  };

  const handleAddHeaderPartner = () => {
    updateSapJson((obj) => {
      if (!Array.isArray(obj.output.to_Partner)) obj.output.to_Partner = [];
      obj.output.to_Partner.push({
        PartnerFunction: "",
        Customer: "",
        Supplier: "",
        Personnel: "",
        ContactPerson: "",
      });
    });
    toast.success("Added header partner");
  };

  const handleAddHeaderPricing = () => {
    updateSapJson((obj) => {
      if (!Array.isArray(obj.output.to_PricingElement)) obj.output.to_PricingElement = [];
      obj.output.to_PricingElement.push({
        PricingProcedureStep: "",
        PricingProcedureCounter: "",
        ConditionType: "",
        ConditionAmount: 0,
        ConditionCurrency: "",
      });
    });
    toast.success("Added header pricing");
  };

  const handleAddItem = () => {
    updateSapJson((obj) => {
      if (!Array.isArray(obj.output.to_Item)) obj.output.to_Item = [];
      obj.output.to_Item.push({
        SalesOrderItem: String(obj.output.to_Item.length + 10).padStart(4, "0"),
        Material: "",
        RequestedQuantity: 1,
        RequestedQuantityUnit: "EA",
        to_ItemPartner: [],
        to_ItemPricingElement: [],
      });
    });
    toast.success("Added item");
  };

  const handleAddItemPartner = () => {
    updateSapJson((obj) => {
      if (!Array.isArray(obj.output.to_Item) || obj.output.to_Item.length === 0) {
        obj.output.to_Item = [
          { SalesOrderItem: "0010", Material: "", RequestedQuantity: 1, RequestedQuantityUnit: "EA", to_ItemPartner: [], to_ItemPricingElement: [] },
        ];
      }
      const last = obj.output.to_Item[obj.output.to_Item.length - 1];
      if (!Array.isArray(last.to_ItemPartner)) last.to_ItemPartner = [];
      last.to_ItemPartner.push({ PartnerFunction: "", Customer: "" });
    });
    toast.success("Added item partner to last item");
  };

  const handleAddItemPricing = () => {
    updateSapJson((obj) => {
      if (!Array.isArray(obj.output.to_Item) || obj.output.to_Item.length === 0) {
        obj.output.to_Item = [
          { SalesOrderItem: "0010", Material: "", RequestedQuantity: 1, RequestedQuantityUnit: "EA", to_ItemPartner: [], to_ItemPricingElement: [] },
        ];
      }
      const last = obj.output.to_Item[obj.output.to_Item.length - 1];
      if (!Array.isArray(last.to_ItemPricingElement)) last.to_ItemPricingElement = [];
      last.to_ItemPricingElement.push({
        PricingProcedureStep: "",
        PricingProcedureCounter: "",
        ConditionType: "",
        ConditionAmount: 0,
        ConditionCurrency: "",
      });
    });
    toast.success("Added item pricing to last item");
  };

  const handleValidate = () => {
    if (!showSap) {
      toast.message("Switch to SAP Payload to validate");
      return;
    }
    const ok = runValidation(editorValue);
    if (ok) toast.success("SAP payload is valid");
    else toast.error("SAP payload is invalid");
  };

  // Show a full-screen animated loader while auth initializes
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        {/* Header skeleton */}
        <header className="border-b">
          <div className="max-w-7xl mx-auto px-8 py-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-6 w-28" />
            </div>
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </header>

        {/* Hero skeleton */}
        <main className="flex-1 flex flex-col items-center justify-center px-8 py-24">
          <div className="max-w-4xl mx-auto w-full text-center space-y-8">
            <div className="flex justify-center">
              <Skeleton className="h-8 w-64 rounded-full" />
            </div>

            <div className="space-y-3">
              <Skeleton className="h-12 w-3/4 mx-auto" />
              <Skeleton className="h-12 w-1/2 mx-auto" />
            </div>

            <div className="space-y-2 max-w-2xl mx-auto">
              <Skeleton className="h-4 w-full mx-auto" />
              <Skeleton className="h-4 w-11/12 mx-auto" />
              <Skeleton className="h-4 w-10/12 mx-auto" />
            </div>

            <div className="flex justify-center pt-2">
              <Skeleton className="h-10 w-36 rounded-md" />
            </div>
          </div>

          {/* Features skeleton */}
          <div className="max-w-5xl mx-auto mt-24 grid md:grid-cols-3 gap-8 w-full">
            <div className="p-8 rounded-lg border bg-card/50">
              <Skeleton className="h-12 w-12 rounded-lg mb-4" />
              <Skeleton className="h-5 w-40 mb-2" />
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-5/6" />
            </div>
            <div className="p-8 rounded-lg border bg-card/50">
              <Skeleton className="h-12 w-12 rounded-lg mb-4" />
              <Skeleton className="h-5 w-40 mb-2" />
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-5/6" />
            </div>
            <div className="p-8 rounded-lg border bg-card/50">
              <Skeleton className="h-12 w-12 rounded-lg mb-4" />
              <Skeleton className="h-5 w-40 mb-2" />
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>
        </main>

        {/* Footer skeleton */}
        <footer className="border-t py-8">
          <div className="max-w-7xl mx-auto px-8 text-center">
            <Skeleton className="h-4 w-40 mx-auto" />
          </div>
        </footer>
      </div>
    );
  }

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate('/dashboard');
    } else {
      navigate('/auth');
    }
  };

  // Add: handlers for SAP panel
  const handleFormat = () => {
    try {
      const parsed = JSON.parse(editorValue || '{}');
      if (showSap) {
        const coerced = coerceSapBySchema(parsed);
        const ordered = reorderSapPayload(coerced);
        const pretty = JSON.stringify(ordered, null, 2);
        setEditorValue(pretty);
        setSapJson(pretty);
      } else {
        const pretty = JSON.stringify(parsed, null, 2);
        setEditorValue(pretty);
        setRawJson(pretty);
      }
      toast.success('JSON formatted');
    } catch {
      toast.error('Invalid JSON; cannot format');
    }
  };

  // Update Save to validate SAP when editing SAP
  const handleSave = async () => {
    if (!docId) {
      toast.error('Enter a document id');
      return;
    }
    let payload: any = null;
    try {
      payload = JSON.parse(editorValue || '{}');
    } catch {
      toast.error('JSON is not valid');
      return;
    }

    // Validate SAP when saving SAP JSON
    if (showSap) {
      // Coerce by schema and reorder before validating and saving
      const coerced = coerceSapBySchema(payload);
      const ordered = reorderSapPayload(coerced);
      const pretty = JSON.stringify(ordered, null, 2);
      setEditorValue(pretty);
      setSapJson(pretty);
      payload = ordered;

      const ok = runValidation(pretty);
      if (!ok) {
        toast.error('Validation failed; fix errors before saving');
        return;
      }
    }

    if (!hasSupabaseEnv) {
      toast.error('Supabase is not configured');
      return;
    }
    setIsSaving(true);
    try {
      // Try updating a list of likely app fields; fall back to SAP_AI_OUTPUT
      const fieldCandidates: Array<string> = [
        'SAP_JSON_FROM_APP',
        'sap_json_from_app',
        'SAP JSON from app',
        'sap_json_app',
        'sap_app_json',
      ];
      let saved = false;
      for (const field of fieldCandidates) {
        const { error } = await supabase
          .from('N8N Logs')
          .update({ [field]: payload })
          .eq('id', docId);
        if (!error) {
          saved = true;
          break;
        } else if (String(error.message || '').toLowerCase().includes('column') && String(error.message || '').toLowerCase().includes('does not exist')) {
          // Try next candidate if column missing
          continue;
        } else {
          // Other errors should be surfaced
          throw error;
        }
      }
      if (!saved) {
        // Fallback to SAP_AI_OUTPUT if none of the app fields worked
        const { error: fbError } = await supabase
          .from('N8N Logs')
          .update({ SAP_AI_OUTPUT: payload })
          .eq('id', docId);
        if (fbError) throw fbError;
      }
      toast.success('Saved successfully');
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message || e}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Update Create to validate SAP payload
  const handleCreate = async () => {
    if (!docId) {
      toast.error('Enter a document id');
      return;
    }
    // Always send SAP payload (edited)
    let payload: any = null;
    try {
      payload = JSON.parse(sapJson || '{}');
    } catch {
      toast.error('SAP payload is not valid JSON');
      return;
    }

    // Coerce and reorder before validation and sending
    payload = reorderSapPayload(coerceSapBySchema(payload));
    const pretty = JSON.stringify(payload, null, 2);
    setSapJson(pretty);
    if (showSap) setEditorValue(pretty);

    const ok = runValidation(JSON.stringify(payload));
    if (!ok) {
      toast.error('Validation failed; fix errors before sending');
      return;
    }

    const envWebhook = import.meta.env.VITE_WEBHOOK_URL as string | undefined;
    if (!envWebhook) {
      toast.error('Webhook URL is not configured');
      return;
    }
    setIsCreating(true);
    try {
      const res = await fetch(envWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: docId, payload }),
      });
      if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
      toast.success('Webhook called successfully');
    } catch (e: any) {
      toast.error(`Webhook failed: ${e?.message || e}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex flex-col bg-background"
    >
      {/* Header */}
      <header className="border-b">
        <div className="max-w-7xl mx-auto px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Logo" className="h-8 w-8" />
            <span className="text-xl font-bold tracking-tight">DocuVision</span>
          </div>
          <div className="flex items-center gap-3">
            {isAuthenticated && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full h-10 w-10 bg-primary/10 hover:bg-primary/20"
                    aria-label="User menu"
                  >
                    <User className="h-5 w-5 text-primary" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-xs text-muted-foreground">Signed in as</p>
                      <p className="text-sm font-medium leading-none">{user?.email || 'User'}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer">
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/dashboard')} className="cursor-pointer">
                    Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      await signOut();
                      navigate('/');
                    }}
                    className="cursor-pointer text-red-600"
                  >
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              variant="outline"
              onClick={handleGetStarted}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isAuthenticated ? (
                'Dashboard'
              ) : (
                'Sign In'
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 py-24">
        {/* Offline error banner */}
        {!isOnline && (
          <div className="max-w-2xl w-full mx-auto mb-6">
            <Alert variant="destructive">
              <AlertTitle>Offline</AlertTitle>
              <AlertDescription>
                You're currently offline. Some data may not load until your connection is restored.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="max-w-4xl mx-auto text-center space-y-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted text-sm font-medium">
            <Zap className="h-4 w-4" />
            Intelligent Document Processing
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight">
            Extract insights from
            <br />
            <span className="text-primary">documents instantly</span>
          </h1>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Visualize document data with interactive PDF previews. Hover over fields to highlight
            and zoom into specific sections with precision.
          </p>

          <div className="flex items-center justify-center gap-4 pt-4">
            <Button
              size="lg"
              onClick={handleGetStarted}
              disabled={isLoading}
              className="text-base px-8"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : (
                <>
                  Get Started
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
          </div>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="max-w-5xl mx-auto mt-32 grid md:grid-cols-3 gap-8"
        >
          <motion.div
            whileHover={{ y: -8, boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-center space-y-4 p-8 rounded-lg border bg-card/50 hover:bg-card transition-colors cursor-pointer"
          >
            <motion.div
              whileHover={{ scale: 1.1, rotate: 5 }}
              className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10"
            >
              <FileText className="h-6 w-6 text-primary" />
            </motion.div>
            <h3 className="text-lg font-semibold">Interactive Preview</h3>
            <p className="text-muted-foreground leading-relaxed">
              View PDFs with real-time highlighting and zoom capabilities for precise document
              inspection.
            </p>
          </motion.div>

          <motion.div
            whileHover={{ y: -8, boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-center space-y-4 p-8 rounded-lg border bg-card/50 hover:bg-card transition-colors cursor-pointer"
          >
            <motion.div
              whileHover={{ scale: 1.1, rotate: -5 }}
              className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10"
            >
              <Search className="h-6 w-6 text-primary" />
            </motion.div>
            <h3 className="text-lg font-semibold">Smart Extraction</h3>
            <p className="text-muted-foreground leading-relaxed">
              Automatically extract structured data from documents with bounding box coordinates.
            </p>
          </motion.div>

          <motion.div
            whileHover={{ y: -8, boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-center space-y-4 p-8 rounded-lg border bg-card/50 hover:bg-card transition-colors cursor-pointer"
          >
            <motion.div
              whileHover={{ scale: 1.1, rotate: 5 }}
              className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10"
            >
              <Zap className="h-6 w-6 text-primary" />
            </motion.div>
            <h3 className="text-lg font-semibold">Instant Access</h3>
            <p className="text-muted-foreground leading-relaxed">
              Connect to your Supabase database and access documents instantly with zero
              configuration.
            </p>
          </motion.div>
        </motion.div>

        {/* SAP Webhook Panel */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="max-w-5xl mx-auto mt-12 w-full"
        >
          <Card className="bg-card/60">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>SAP Webhook</span>
                <div className="flex items-center gap-2">
                  {/* Validation status */}
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    isValid === null ? 'bg-muted text-muted-foreground' : isValid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {isValid === null ? '—' : isValid ? 'Valid' : `${validationErrors?.length || 0} errors`}
                  </span>
                  <Button variant="outline" size="sm" onClick={handleValidate}>
                    Validate
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSave}
                    disabled={!docId || isSaving}
                  >
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Save
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreate}
                    disabled={!docId || isCreating}
                  >
                    {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Create
                  </Button>
                </div>
              </CardTitle>
              <div className="text-xs text-muted-foreground">
                {hasSupabaseEnv ? (
                  isRowLoading ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading row…
                    </span>
                  ) : (
                    <span>Supabase connected</span>
                  )
                ) : (
                  <span>Supabase not configured</span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-5 max-h-[70vh] overflow-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="docId">Document ID</Label>
                  <Input
                    id="docId"
                    placeholder="Enter document id (or use ?id= in URL)"
                    value={docId}
                    onChange={(e) => setDocId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="webhookUrl">Webhook URL</Label>
                  <Input
                    id="webhookUrl"
                    placeholder="https://example.com/webhook"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-2">
                <div className="text-sm font-medium">Editing SAP Payload</div>
                <div className="text-xs text-muted-foreground">Schema-validated</div>
              </div>

              {isRowLoading && (
                <div className="space-y-2 pt-1">
                  {[...Array(6)].map((_, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06, type: 'spring', stiffness: 260, damping: 20 }}
                      className="h-4 bg-muted rounded"
                    />
                  ))}
                </div>
              )}

              {showSap && (
                <div className="flex flex-wrap gap-2.5 pt-2">
                  <Button variant="outline" size="sm" onClick={handleAddHeaderPartner}>Add Header Partner</Button>
                  <Button variant="outline" size="sm" onClick={handleAddHeaderPricing}>Add Header Pricing</Button>
                  <Button variant="outline" size="sm" onClick={handleAddItem}>Add Item</Button>
                  <Button variant="outline" size="sm" onClick={handleAddItemPartner}>Add Item Partner (last)</Button>
                  <Button variant="outline" size="sm" onClick={handleAddItemPricing}>Add Item Pricing (last)</Button>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="editor">{showSap ? 'SAP Payload (editable)' : 'Current JSON (read-only if from DB)'}</Label>
                <Textarea
                  id="editor"
                  className="h-[55vh] min-h-[220px] font-mono text-xs resize-y overflow-auto"
                  value={editorValue}
                  onChange={(e) => {
                    setEditorValue(e.target.value);
                    if (showSap) setSapJson(e.target.value);
                    else setRawJson(e.target.value);
                  }}
                  onBlur={() => {
                    if (!showSap) return;
                    try {
                      const parsed = JSON.parse(editorValue || "{}");
                      const coerced = coerceSapBySchema(parsed);
                      const ordered = reorderSapPayload(coerced);
                      const pretty = JSON.stringify(ordered, null, 2);
                      setEditorValue(pretty);
                      setSapJson(pretty);
                    } catch {
                      // ignore
                    }
                  }}
                  placeholder={showSap ? '{ "output": { ... } }' : '{ ... }'}
                />
              </div>

              {showSap && isValid === false && validationErrors && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 space-y-1">
                  {validationErrors.slice(0, 8).map((e, idx) => (
                    <div key={idx}>
                      {(e.instancePath || '') || '/'}: {e.message}
                    </div>
                  ))}
                  {validationErrors.length > 8 && (
                    <div>+{validationErrors.length - 8} more…</div>
                  )}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex items-center justify-end">
              <Button variant="outline" onClick={handleFormat}>
                Format JSON
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="max-w-7xl mx-auto px-8 text-center text-sm text-muted-foreground">
          Powered by{' '}
          <a
            href="https://vly.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-primary transition-colors"
          >
            vly.ai
          </a>
        </div>
      </footer>
    </motion.div>
  );
}