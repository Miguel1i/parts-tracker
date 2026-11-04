import { looksLikeSearchUrl } from "../match/url";
import { pass, veto, type Rule } from "./context";

const ID = "A8-not-product";

/** A8: search/listing URLs, or a page that is structurally a listing. */
export const notProductRule: Rule = {
  id: ID,
  stages: ["link", "page"],
  run({ offer }) {
    if (looksLikeSearchUrl(offer.url))
      return veto(ID, "URL is a search or listing page", { url: offer.url });
    if (offer.pageKind === "listing") return veto(ID, "page lists several products");
    return pass(ID, "product page");
  },
};
