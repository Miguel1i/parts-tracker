import type { Attributes } from "../match/attributes";
import type { Category } from "../match/types";
import { pass, result, type Rule } from "./context";

const ID = "AT-attributes";
const AGREE = 3;
const AGREE_CAP = 9;
const MISSING = -4;
const MISSING_CAP = -12;

type Check = { name: string; get: (a: Attributes) => string | null; penalizeMissing?: boolean };
const list = (v: (string | number)[]) => (v.length ? [...v].sort().join("/") : null);
const val = (v: string | number | boolean | undefined) =>
  v === undefined || v === false ? null : String(v);

const CAPACITY: Check = {
  name: "capacity",
  get: (a) => list(a.capacitiesGb),
  penalizeMissing: true,
};
const COLOUR: Check = { name: "colour", get: (a) => list(a.colours), penalizeMissing: true };
const LIGHTING: Check = { name: "lighting", get: (a) => val(a.lighting), penalizeMissing: true };

const CHECKS: Record<Category, Check[]> = {
  cpu: [],
  gpu: [CAPACITY],
  motherboard: [{ name: "wifi", get: (a) => val(a.wifi) }],
  ram: [
    {
      name: "kit",
      get: (a) => (a.layout ? `${a.layout.modules}x${a.layout.sizeGb}` : null),
      penalizeMissing: true,
    },
    { name: "total", get: (a) => val(a.totalGb), penalizeMissing: true },
    { name: "speed", get: (a) => val(a.speedMts), penalizeMissing: true },
  ],
  ssd: [CAPACITY],
  hdd: [CAPACITY],
  psu: [
    { name: "power", get: (a) => list(a.watts), penalizeMissing: true },
    { name: "tier", get: (a) => list(a.tiers), penalizeMissing: true },
  ],
  case: [COLOUR, LIGHTING],
  cooler: [
    { name: "radiator", get: (a) => val(a.radiatorMm), penalizeMissing: true },
    COLOUR,
    LIGHTING,
  ],
  fan: [COLOUR, LIGHTING],
  monitor: [{ name: "size", get: (a) => val(a.screenInch), penalizeMissing: true }],
  other: [],
};

/**
 * Spec attributes as a whole: each one present on both sides and equal adds points; each one
 * the product names but the offer doesn't costs points. Mismatches are vetoed by B5–B7.
 */
export const attributesRule: Rule = {
  id: ID,
  stages: ["listing", "page"],
  run({ ref, cand, target }) {
    const checks = [...CHECKS[target.category]];
    // A colour the product names counts in every category.
    if (!checks.includes(COLOUR) && ref.attrs.colours.length) checks.push(COLOUR);
    let plus = 0;
    let minus = 0;
    const agree: string[] = [];
    const missing: string[] = [];
    for (const c of checks) {
      const a = c.get(ref.attrs);
      if (a === null) continue;
      const b = c.get(cand.attrs);
      if (b === null) {
        if (c.penalizeMissing) {
          minus += MISSING;
          missing.push(c.name);
        }
      } else if (a === b || b.split("/").some((x) => a.split("/").includes(x))) {
        plus += AGREE;
        agree.push(`${c.name} ${a}`);
      }
    }
    const w = Math.min(plus, AGREE_CAP) + Math.max(minus, MISSING_CAP);
    const evidence = [
      agree.length ? `agree: ${agree.join(", ")}` : "",
      missing.length ? `not stated: ${missing.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    if (!evidence) return pass(ID, "no attributes to compare");
    return result(ID, w > 0 ? "boost" : w < 0 ? "penalty" : "pass", w, evidence);
  },
};
