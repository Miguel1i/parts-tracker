import { gpuLines } from "../lexicon/words";
import { pass, result, veto, type Rule } from "./context";

const ID = "B2-gpu-line";
const LINES = [...gpuLines]
  .sort((a, b) => b.length - a.length)
  .map((l) => [l, new RegExp(`(?<![a-z0-9])${l.replace(/ /g, "\\s*")}(?![a-z0-9])`)] as const);

/** The longest GPU board line named in a text ("gaming trio" before "gaming x"). */
export function gpuLine(text: string): string | null {
  for (const [line, re] of LINES) if (re.test(text)) return line;
  return null;
}

function ocLevel(text: string): "oc plus" | "oc" | "none" {
  if (/(?<![a-z0-9])oc\s*plus(?![a-z0-9])/.test(text)) return "oc plus";
  if (/(?<![a-z0-9])oc(?![a-z0-9])/.test(text)) return "oc";
  return "none";
}

/** B2: a different board line vetoes (Ventus vs Gaming Trio); OC vs non-OC costs points. */
export const gpuLineRule: Rule = {
  id: ID,
  run({ ref, cand, target, stage }) {
    if (target.category !== "gpu") return pass(ID, "not a GPU");
    const want = gpuLine(ref.text);
    const got = gpuLine(cand.text);
    if (want && got && want !== got) return veto(ID, `board line ${got} ≠ ${want}`, { want, got });
    if (stage === "link") return pass(ID, want ?? "no line");
    const a = ocLevel(ref.text);
    const b = ocLevel(cand.text);
    if (a !== b)
      return result(ID, "penalty", -10, `factory OC differs: ${b} vs ${a}`, { want: a, got: b });
    return pass(ID, want ? `${want}${a === "none" ? "" : ` ${a}`}` : "no line named");
  },
};
