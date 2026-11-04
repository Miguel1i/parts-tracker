/** Text folding and tokenizing shared by every rule. */

/** Lower case, accents and ™®© removed, dashes unified, whitespace collapsed. */
export function fold(input: string | null | undefined): string {
  if (!input) return "";
  // ™®© first: NFKD would turn "™" into "TM" ("RYZEN™" → "ryzentm").
  return input
    .replace(/[™®©℠]/g, " ")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’´`]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Letters and digits only: "NH-D15S" → "nhd15s". */
export function compact(input: string | null | undefined): string {
  return fold(input).replace(/[^a-z0-9]/g, "");
}

/**
 * Folds a product title and repairs the splits shops make inside model names, so that every
 * shop's spelling tokenizes the same way:
 * - "9800X 3D" → "9800x3d" (Amazon UK)
 * - "RTX5070Ti" → "rtx 5070 ti", "RX 9070XT" → "rx 9070 xt" (variant words become their own token)
 * - "2 x 16GB" → "2x16gb"
 */
export function normalizeTitle(input: string | null | undefined): string {
  return fold(input)
    .replace(/(\d{3,5}x)\s+3d\b/g, "$13d")
    .replace(/\b(rtx|gtx|rx|arc|gt)(?=\d)/g, "$1 ")
    .replace(/\b(\d{3,4})(ti|super|xtx|xt|gre)\b/g, "$1 $2")
    .replace(/\b(\d+)\s*x\s*(\d+)\s*(gb|tb)\b/g, "$1x$2$3");
}

/** Splits normalized text into tokens; keeps inner `.`, `-` and `+` ("nh-d15s", "chromax.black"). */
export function tokenize(normalized: string): string[] {
  return normalized
    .split(/[^a-z0-9.+-]+/)
    .map((t) => t.replace(/^[.+-]+|[.+-]+$/g, ""))
    .filter(Boolean);
}

/**
 * Every compact form a reference token can be found as in a candidate title: the candidate's
 * own tokens, plus 2- and 3-token joins so "NH D15S" and "Z5 Neo" spacing differences still match.
 */
export function candidateForms(normalized: string): Set<string> {
  const toks = tokenize(normalized).map((t) => t.replace(/[^a-z0-9]/g, ""));
  const forms = new Set<string>();
  for (let i = 0; i < toks.length; i++) {
    const a = toks[i]!;
    if (a) forms.add(a);
    const b = toks[i + 1];
    if (b) forms.add(a + b);
    const c = toks[i + 2];
    if (b && c) forms.add(a + b + c);
  }
  return forms;
}

/** Escapes a string for use inside a RegExp. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
