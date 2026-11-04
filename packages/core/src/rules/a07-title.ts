import { result, veto, type Rule } from "./context";

const ID = "A7-title";
export const TITLE_POINTS = 50;

/** A7: weighted token similarity; a missing model-number token vetoes. */
export const titleRule: Rule = {
  id: ID,
  run({ sim, offer }) {
    if (!offer.title) return veto(ID, "no title");
    const params = {
      similarity: Math.round(sim.sim * 1000) / 1000,
      missing: sim.missing.map((t) => t.token).join(","),
    };
    if (sim.missingModels.length)
      return veto(
        ID,
        `model token missing: ${sim.missingModels.map((t) => t.token).join(", ")}`,
        params,
      );
    const w = Math.round(TITLE_POINTS * sim.sim * 10) / 10;
    const miss = sim.missing.length
      ? `; missing ${sim.missing.map((t) => t.token).join(", ")}`
      : "";
    return result(ID, "boost", w, `title ${Math.round(sim.sim * 100)}% similar${miss}`, params);
  },
};
