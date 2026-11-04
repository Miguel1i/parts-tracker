import { pass, veto, type Rule } from "./context";

const ID = "B4-packaging";

/**
 * B4: tray/OEM vs retail box, when the product specifies one (`matchSpec.packaging`, or the
 * product name says "tray"/"box"). "Sem cooler" / "without fan" is not used as a tray signal:
 * AMD's boxed X3D (WOF) ships without a cooler too.
 */
export const packagingRule: Rule = {
  id: ID,
  run({ spec, ref, cand }) {
    const want = spec.packaging && spec.packaging !== "any" ? spec.packaging : ref.attrs.packaging;
    const got = cand.attrs.packaging;
    if (!want) return pass(ID, got ? `offer is ${got}, any packaging accepted` : "any packaging");
    if (got && got !== want)
      return veto(ID, `offer is ${got}, the product is ${want}`, { want, got });
    return pass(ID, got ? `${got}` : `${want} assumed`);
  },
};
