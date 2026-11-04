import type { Attributes } from "../match/attributes";
import type { Category } from "../match/types";
import { pass, veto, type Rule } from "./context";

const ID = "B6-capacity";

type Measure = { name: string; unit: string; get: (a: Attributes) => number[] };
const one = (v: number | undefined) => (v === undefined ? [] : [v]);
const MEASURES: Partial<Record<Category, Measure>> = {
  ssd: { name: "capacity", unit: "GB", get: (a) => a.capacitiesGb },
  hdd: { name: "capacity", unit: "GB", get: (a) => a.capacitiesGb },
  gpu: { name: "memory", unit: "GB", get: (a) => a.capacitiesGb },
  psu: { name: "power", unit: "W", get: (a) => a.watts },
  cooler: { name: "radiator", unit: "mm", get: (a) => one(a.radiatorMm) },
  monitor: { name: "size", unit: '"', get: (a) => one(a.screenInch) },
};

/** B6: capacity / power / radiator / screen size differ (value + unit, not just digits). */
export const capacityRule: Rule = {
  id: ID,
  run({ ref, cand, target }) {
    const m = MEASURES[target.category];
    if (!m) return pass(ID, "not checked for this category");
    const want = m.get(ref.attrs);
    const got = m.get(cand.attrs);
    if (!want.length || !got.length) return pass(ID, `no ${m.name} on one side`);
    if (!want.some((w) => got.includes(w)))
      return veto(ID, `${m.name} ${got.join("/")} ${m.unit} ≠ ${want.join("/")} ${m.unit}`, {
        want: want.join(","),
        got: got.join(","),
      });
    return pass(ID, `${m.name} ${want.join("/")} ${m.unit}`);
  },
};
