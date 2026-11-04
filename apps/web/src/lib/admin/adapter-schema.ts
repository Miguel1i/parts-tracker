import { z } from "zod";

const optStr = z.string().trim().min(1).optional();

export const adapterConfigSchema = z.looseObject({
  selectors: z
    .strictObject({
      item: optStr,
      title: optStr,
      price: optStr,
      url: optStr,
      stock: optStr,
      image: optStr,
    })
    .optional(),
  apiEndpoint: optStr,
  sellerRule: z
    .strictObject({
      ownNames: z.array(z.string().trim().min(1)).optional(),
      sellerSelector: optStr,
      thirdPartyMarkers: z.array(z.string().trim().min(1)).optional(),
      urlParam: optStr,
      mustContain: optStr,
    })
    .optional(),
  throttleMs: z.number().int().min(1500, "throttleMs must be at least 1500").optional(),
  maxConcurrency: z.number().int().min(1).max(2, "maxConcurrency must be 1 or 2").optional(),
});

export type AdapterConfigInput = z.infer<typeof adapterConfigSchema>;

/** The adapter editor's fields, all strings as typed into inputs. */
export type AdapterFormFields = {
  selectors: {
    item: string;
    title: string;
    price: string;
    url: string;
    stock: string;
    image: string;
  };
  apiEndpoint: string;
  sellerRule: {
    ownNames: string;
    sellerSelector: string;
    thirdPartyMarkers: string;
    urlParam: string;
    mustContain: string;
  };
  throttleMs: string;
  maxConcurrency: string;
};

/** Zod shape for the same fields, for action inputs. */
export const adapterFormFieldsSchema = z.object({
  selectors: z.object({
    item: z.string(),
    title: z.string(),
    price: z.string(),
    url: z.string(),
    stock: z.string(),
    image: z.string(),
  }),
  apiEndpoint: z.string(),
  sellerRule: z.object({
    ownNames: z.string(),
    sellerSelector: z.string(),
    thirdPartyMarkers: z.string(),
    urlParam: z.string(),
    mustContain: z.string(),
  }),
  throttleMs: z.string(),
  maxConcurrency: z.string(),
});

export const emptyAdapterFields = (): AdapterFormFields => ({
  selectors: { item: "", title: "", price: "", url: "", stock: "", image: "" },
  apiEndpoint: "",
  sellerRule: {
    ownNames: "",
    sellerSelector: "",
    thirdPartyMarkers: "",
    urlParam: "",
    mustContain: "",
  },
  throttleMs: "",
  maxConcurrency: "",
});

const KNOWN = ["selectors", "apiEndpoint", "sellerRule", "throttleMs", "maxConcurrency"];
const SELECTOR_KEYS = ["item", "title", "price", "url", "stock", "image"] as const;
const SELLER_KEYS = ["sellerSelector", "urlParam", "mustContain"] as const;

const splitList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export type MergeResult =
  { ok: true; config: Record<string, unknown> } | { ok: false; error: string };

/** Drops empty strings, empty arrays and empty objects, recursively. */
function prune(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? value : undefined;
  if (isObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const p = prune(v);
      if (p !== undefined) out[k] = p;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (typeof value === "string") return value.trim() === "" ? undefined : value;
  return value;
}

export function mergeAdapterConfig(fields: AdapterFormFields, overridesJson: string): MergeResult {
  let overrides: Record<string, unknown> = {};
  if (overridesJson.trim() !== "") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(overridesJson);
    } catch {
      return { ok: false, error: "Other overrides is not valid JSON" };
    }
    if (!isObject(parsed)) return { ok: false, error: "Other overrides must be a JSON object" };
    overrides = parsed;
  }

  const numberOrRaw = (s: string): unknown => {
    const t = s.trim();
    if (t === "") return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : t;
  };

  const fromForm = {
    selectors: Object.fromEntries(SELECTOR_KEYS.map((k) => [k, fields.selectors[k].trim()])),
    apiEndpoint: fields.apiEndpoint.trim(),
    sellerRule: {
      ownNames: splitList(fields.sellerRule.ownNames),
      thirdPartyMarkers: splitList(fields.sellerRule.thirdPartyMarkers),
      ...Object.fromEntries(SELLER_KEYS.map((k) => [k, fields.sellerRule[k].trim()])),
    },
    throttleMs: numberOrRaw(fields.throttleMs),
    maxConcurrency: numberOrRaw(fields.maxConcurrency),
  };

  const pruned = prune(fromForm) as Record<string, unknown> | undefined;
  // The form owns the known keys: a known key left blank there is dropped even if overridden.
  const merged: Record<string, unknown> = { ...overrides };
  for (const k of KNOWN) delete merged[k];
  Object.assign(merged, pruned ?? {});
  const cleaned = (prune(merged) as Record<string, unknown> | undefined) ?? {};

  const result = adapterConfigSchema.safeParse(cleaned);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    const path = issue.path.join(".");
    return { ok: false, error: path ? `${path}: ${issue.message}` : issue.message };
  }
  return { ok: true, config: result.data };
}

/** The reverse, for the edit form: known keys to fields, everything else to the overrides JSON. */
export function splitAdapterConfig(config: Record<string, unknown> | null | undefined): {
  fields: AdapterFormFields;
  overrides: string;
} {
  const c = config ?? {};
  const fields = emptyAdapterFields();
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).join(", ") : "");
  const num = (v: unknown) => (typeof v === "number" ? String(v) : "");
  const sel = isObject(c.selectors) ? c.selectors : {};
  for (const k of SELECTOR_KEYS) fields.selectors[k] = str(sel[k]);
  fields.apiEndpoint = str(c.apiEndpoint);
  const sr = isObject(c.sellerRule) ? c.sellerRule : {};
  fields.sellerRule.ownNames = list(sr.ownNames);
  fields.sellerRule.thirdPartyMarkers = list(sr.thirdPartyMarkers);
  for (const k of SELLER_KEYS) fields.sellerRule[k] = str(sr[k]);
  fields.throttleMs = num(c.throttleMs);
  fields.maxConcurrency = num(c.maxConcurrency);
  const rest = Object.fromEntries(Object.entries(c).filter(([k]) => !KNOWN.includes(k)));
  return { fields, overrides: Object.keys(rest).length ? JSON.stringify(rest, null, 2) : "" };
}
