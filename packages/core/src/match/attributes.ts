/**
 * Parses the spec attributes the B-rules compare: capacity, wattage, memory kit layout and
 * speed, radiator and screen size, efficiency tier, colour, lighting, connectivity, packaging,
 * pack size and regional markers. Works on `normalizeTitle()` output.
 */
import {
  boxWords,
  colours,
  efficiencyTiers,
  importWords,
  multipackPatterns,
  trayWords,
  ukPlug,
  wordsRegex,
} from "../lexicon/words";
import type { Category } from "./types";

export interface Attributes {
  /** Storage / VRAM / kit capacities in GB. */
  capacitiesGb: number[];
  /** RAM kit layout, e.g. `{ modules: 2, sizeGb: 16 }`. */
  layout?: { modules: number; sizeGb: number };
  /** Total memory kit capacity (layout product, or the stated total). */
  totalGb?: number;
  ddr?: number;
  speedMts?: number;
  cl?: number;
  watts: number[];
  radiatorMm?: number;
  screenInch?: number;
  tiers: string[];
  cybenetics: boolean;
  colours: string[];
  lighting: boolean;
  wifi: boolean;
  packaging?: "box" | "tray";
  packSize?: number;
  ukPlug: boolean;
  imported: boolean;
}

const TRAY = wordsRegex(trayWords);
const BOX = wordsRegex(boxWords);
const UK_PLUG = wordsRegex(ukPlug);
const IMPORTED = wordsRegex(importWords);
const TIER = wordsRegex(efficiencyTiers, "gi");
const PACKS = multipackPatterns.map((p) => new RegExp(`(?<![a-z0-9])${p}`, "i"));
const COLOUR_PATTERNS = Object.entries(colours).map(
  ([name, words]) => [name, wordsRegex(words.map((w) => w.replace(/\./g, "\\.")))] as const,
);

function num(s: string): number {
  return Number(s.replace(",", "."));
}

/**
 * Text spans that the attribute parser understands. Title similarity strips them so a value
 * isn't counted twice (once as a token, once as an attribute).
 */
export const ATTRIBUTE_SPANS: RegExp[] = [
  /\b\d+x\d+(?:gb|tb)\b/g,
  /\b\d+(?:[.,]\d+)?\s*(?:tb|gb|mb|kb)\b/g,
  /\bddr\d[- ]?\d{4}\b/g,
  /\b\d{4}\s*(?:mhz|mt\/s|mts)\b/g,
  /\bc(?:l)?\d{2}\b/g,
  /\b\d{2,4}\s*w\b/g,
  /\b\d{2,3}\s*mm\b/g,
  /\b\d{2}(?:[.,]\d)?\s*(?:"|''|pol\w*|inch\w*|zoll)/g,
  /\b\d+(?:[.,]\d+)?\s*(?:ghz|hz|cfm|rpm|dba?|v|a|ms|mah)\b/g,
  /\b\d+\s*-?\s*(?:core|cores|nucleos?|nucleo|coeurs?|threads?|fios)\b/g,
  /\b(?:pcie|gen)\s*\d(?:\.\d)?\b/g,
  /\b(?:x\d|m\.2|2280|am\d|lga\s?\d{4}|ddr\d|gddr\d+x?|usb\s?\d(?:\.\d)?\w*|atx\s?\d\.\d|hdmi\s?\d(?:\.\d)?|dp\s?\d(?:\.\d)?)\b/g,
  /\b(?:19|20)\d{2}\b/g,
];

export function parseAttributes(text: string, category: Category): Attributes {
  const capacities = new Set<number>();
  for (const m of text.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(tb|gb)\b/g)) {
    const gb = num(m[1]!) * (m[2] === "tb" ? 1000 : 1);
    if (gb > 0) capacities.add(gb);
  }
  // GPU boards often write VRAM as "16G" (MSI "RTX 5070 Ti 16G GAMING TRIO").
  if (category === "gpu")
    for (const m of text.matchAll(/\b(\d{1,2})g\b/g)) capacities.add(Number(m[1]));

  let layout: Attributes["layout"];
  const lay = text.match(/\b(\d)x(\d+)gb\b/) ?? text.match(/\b(\d)\s*x\s*(\d+)\s*gb\b/);
  if (lay) layout = { modules: Number(lay[1]), sizeGb: Number(lay[2]) };
  else {
    const kit = text.match(/\bkit\s*(?:de\s*)?(\d)\s*(?:x|modulos|modules)?\s*(\d+)\s*gb\b/);
    if (kit) layout = { modules: Number(kit[1]), sizeGb: Number(kit[2]) };
  }

  const ddrSpeed = text.match(/\bddr(\d)[- ]?(\d{4})\b/);
  const ddrOnly = text.match(/\bddr(\d)\b/);
  const mhz = text.match(/\b(\d{4})\s*(?:mhz|mt\/s|mts)\b/);
  const cl = text.match(/\bc(?:l)?(\d{2})\b/);

  let totalGb: number | undefined;
  if (category === "ram") {
    if (layout) totalGb = layout.modules * layout.sizeGb;
    else if (capacities.size) totalGb = Math.max(...capacities);
  }

  const watts = [...text.matchAll(/\b(\d{3,4})\s*w\b/g)].map((m) => Number(m[1]));
  const radiator = text.match(/\b(120|140|240|280|360|420|480)\s*mm\b/);
  const inch = text.match(/\b(\d{2}(?:[.,]\d)?)\s*(?:"|''|pol\w*|inch\w*|zoll)/);

  const tiers = [...new Set([...text.matchAll(TIER)].map((m) => m[0].toLowerCase()))];
  const found: string[] = [];
  for (const [name, re] of COLOUR_PATTERNS) {
    // "silver" is an 80 Plus tier on a PSU, not a colour.
    if (name === "silver" && category === "psu") continue;
    if (re.test(text)) found.push(name);
  }

  let packSize: number | undefined;
  if (category !== "ram") {
    for (const re of PACKS) {
      const m = text.match(re);
      const n = m ? Number(m[1]) : NaN;
      if (n >= 2 && n <= 12) {
        packSize = n;
        break;
      }
    }
  }

  return {
    capacitiesGb: [...capacities],
    layout,
    totalGb,
    ddr: ddrSpeed ? Number(ddrSpeed[1]) : ddrOnly ? Number(ddrOnly[1]) : undefined,
    speedMts: ddrSpeed ? Number(ddrSpeed[2]) : mhz ? Number(mhz[1]) : undefined,
    cl: cl ? Number(cl[1]) : undefined,
    watts: [...new Set(watts)],
    radiatorMm: radiator ? Number(radiator[1]) : undefined,
    screenInch: inch ? num(inch[1]!) : undefined,
    tiers,
    cybenetics: /\bcybenetics\b/.test(text),
    colours: found,
    lighting: /(?<![a-z0-9])(?:a-?rgb|d-rgb|rgb|led)(?![a-z0-9])/.test(text),
    wifi: /(?<![a-z0-9])(?:wi-?fi|wireless|wlan|802\.11)/.test(text),
    packaging: TRAY.test(text) ? "tray" : BOX.test(text) ? "box" : undefined,
    packSize,
    ukPlug: UK_PLUG.test(text),
    imported: IMPORTED.test(text),
  };
}
