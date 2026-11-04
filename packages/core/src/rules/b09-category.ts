import { categoryOfHint, categoryOfSegment, type HintCategory } from "../match/category";
import type { Category } from "../match/types";
import { pass, veto, type Rule } from "./context";

const ID = "B9-category";

/** Categories that shops file together (fans under cooling, SSDs under disks). */
const COMPATIBLE: [HintCategory, HintCategory][] = [
  ["cooler", "fan"],
  ["ssd", "hdd"],
];
const compatible = (a: HintCategory, b: Category) =>
  a === b || COMPATIBLE.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

function urlSegments(url: string): string[] {
  try {
    return new URL(url).pathname.split("/").filter(Boolean);
  } catch {
    return [];
  }
}

/** B9: breadcrumbs / JSON-LD category / URL path say the offer is another kind of product. */
export const categoryRule: Rule = {
  id: ID,
  run({ target, offer }) {
    if (target.category === "other") return pass(ID, "product has no category");
    let got: HintCategory | null = null;
    let source = "";
    for (const h of offer.categoryHints) {
      const c = categoryOfHint(h);
      if (c) {
        got = c;
        source = h;
      }
    }
    if (!got)
      for (const s of urlSegments(offer.url)) {
        const c = categoryOfSegment(s);
        if (c) {
          got = c;
          source = s;
          break;
        }
      }
    if (!got) return pass(ID, "no category on the offer");
    if (!compatible(got, target.category))
      return veto(ID, `offer is in ${got} ("${source}"), the product is ${target.category}`, {
        want: target.category,
        got,
        source,
      });
    return pass(ID, `category ${got}`);
  },
};
