import { compact } from "../match/text";
import { asinFromUrl, canonicalUrl } from "../match/url";
import { pass, veto, type Rule } from "./context";

const ID = "A14-blocklist";

/** A14: the offer was marked wrong for this product: by canonical URL, shop product ID or title. */
export const blocklistRule: Rule = {
  id: ID,
  run({ target, offer }) {
    const list = target.blocklist ?? [];
    if (!list.length) return pass(ID, "no blocklist");
    const url = offer.canonicalUrl || canonicalUrl(offer.url);
    const ids = [offer.asin, asinFromUrl(offer.url), offer.sku]
      .filter((s): s is string => !!s)
      .map((s) => s.toUpperCase());
    const title = compact(offer.title);
    for (const b of list) {
      if (b.url && canonicalUrl(b.url) === url) return veto(ID, "URL is blocklisted", { url });
      if (b.externalId && ids.includes(b.externalId.toUpperCase()))
        return veto(ID, `product ID ${b.externalId} is blocklisted`, { externalId: b.externalId });
      if (b.name && title && compact(b.name) === title)
        return veto(ID, "title is blocklisted", { name: b.name });
    }
    return pass(ID, "not blocklisted");
  },
};
