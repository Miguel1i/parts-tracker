import { pass, result, veto, type Rule } from "./context";

const ID = "B7-memory-kit";

/** B7: RAM kit layout, total capacity, DDR generation and speed must match; CL costs points. */
export const memoryRule: Rule = {
  id: ID,
  run({ ref, cand, target, stage }) {
    if (target.category !== "ram") return pass(ID, "not RAM");
    const a = ref.attrs;
    const b = cand.attrs;
    if (
      a.layout &&
      b.layout &&
      (a.layout.modules !== b.layout.modules || a.layout.sizeGb !== b.layout.sizeGb)
    )
      return veto(
        ID,
        `layout ${b.layout.modules}x${b.layout.sizeGb} GB ≠ ${a.layout.modules}x${a.layout.sizeGb} GB`,
      );
    if (a.totalGb && b.totalGb && a.totalGb !== b.totalGb)
      return veto(ID, `total ${b.totalGb} GB ≠ ${a.totalGb} GB`, {
        want: a.totalGb,
        got: b.totalGb,
      });
    if (a.ddr && b.ddr && a.ddr !== b.ddr) return veto(ID, `DDR${b.ddr} ≠ DDR${a.ddr}`);
    if (a.speedMts && b.speedMts && a.speedMts !== b.speedMts)
      return veto(ID, `speed ${b.speedMts} ≠ ${a.speedMts} MT/s`, {
        want: a.speedMts,
        got: b.speedMts,
      });
    if (stage !== "link" && a.cl && b.cl && a.cl !== b.cl)
      return result(ID, "penalty", -10, `CL${b.cl} vs CL${a.cl}`, { want: a.cl, got: b.cl });
    return pass(ID, "kit matches");
  },
};
