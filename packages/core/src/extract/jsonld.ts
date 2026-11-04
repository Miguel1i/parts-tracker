/** JSON-LD and embedded app-state JSON readers. */
import type { CheerioAPI } from "cheerio";

export type Json = Record<string, unknown>;

function parseLoose(text: string): unknown {
  const t = text.trim().replace(/^<!--|-->$/g, "");
  try {
    return JSON.parse(t);
  } catch {
    try {
      // Some shops put raw newlines/tabs inside strings.
      return JSON.parse(t.replace(/[\u0000-\u001f]+/g, " "));
    } catch {
      return null;
    }
  }
}

/** Every object node of every JSON-LD block, `@graph` and nesting flattened. */
export function jsonLdNodes($: CheerioAPI): Json[] {
  const out: Json[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const data = parseLoose($(el).text());
    const stack: unknown[] = [data];
    let guard = 0;
    while (stack.length && guard++ < 5000) {
      const d = stack.pop();
      if (Array.isArray(d)) stack.push(...d);
      else if (d && typeof d === "object") {
        out.push(d as Json);
        for (const v of Object.values(d)) if (v && typeof v === "object") stack.push(v);
      }
    }
  });
  return out;
}

export function typesOf(node: Json): string[] {
  const t = node["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string");
}

export const isType = (node: Json, ...names: string[]) =>
  typesOf(node).some((t) => names.includes(t.replace(/^https?:\/\/schema\.org\//, "")));

export function str(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number") return String(v);
  return undefined;
}

/** `brand` / `seller` style fields: a string or `{ name }`. */
export function nameOf(v: unknown): string | undefined {
  if (Array.isArray(v)) return nameOf(v[0]);
  if (v && typeof v === "object") return str((v as Json).name);
  return str(v);
}

export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v == null ? [] : [v];
}

/** Objects inside embedded app-state JSON (`__NEXT_DATA__`, `application/json`, inline objects). */
export function embeddedJsonNodes($: CheerioAPI, limit = 20000): Json[] {
  const out: Json[] = [];
  $("script").each((_, el) => {
    const type = $(el).attr("type");
    if (type === "application/ld+json") return;
    if (type && !/json|javascript|module/.test(type)) return;
    const text = $(el).text().trim();
    if (!/^[{[]/.test(text) || text.length < 20) return;
    const data = parseLoose(text);
    const stack: unknown[] = [data];
    while (stack.length && out.length < limit) {
      const d = stack.pop();
      if (Array.isArray(d)) stack.push(...d);
      else if (d && typeof d === "object") {
        out.push(d as Json);
        for (const v of Object.values(d)) if (v && typeof v === "object") stack.push(v);
      }
    }
  });
  return out;
}
