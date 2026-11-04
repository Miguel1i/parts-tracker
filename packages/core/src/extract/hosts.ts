/**
 * Built-in extraction profiles for shops whose pages have no usable structured data.
 * Merchant `adapterConfig` overrides these per field; everything else uses the generic readers.
 */
export interface Selectors {
  item?: string;
  title?: string;
  price?: string;
  url?: string;
  stock?: string;
  image?: string;
  brand?: string;
  breadcrumb?: string;
}

export interface SellerConfig {
  /** Names that mean "the shop itself". */
  ownNames?: string[];
  /** Where the seller name is printed. */
  sellerSelector?: string;
  /** HTML substrings that prove a marketplace seller. */
  thirdPartyMarkers?: string[];
}

export interface HostProfile {
  match: RegExp;
  selectors: Selectors;
  seller?: SellerConfig;
  /** Element that holds the shop's product ID. */
  asinSelector?: string;
}

export const HOST_PROFILES: HostProfile[] = [
  {
    match: /(^|\.)amazon\.[a-z.]+$/,
    selectors: {
      // The real title; the page also has an h1 "product summary" block (diagnostico.txt, Amazon.es).
      title: "#productTitle",
      price: [
        "#corePrice_feature_div .a-offscreen",
        "#corePriceDisplay_desktop_feature_div .a-offscreen",
        "#apex_desktop .a-price .a-offscreen",
        "#tp_price_block_total_price_ww .a-offscreen",
        "#price_inside_buybox",
        "#priceblock_ourprice",
      ].join(", "),
      stock: "#availability",
      brand: "#bylineInfo",
      breadcrumb: "#wayfinding-breadcrumbs_feature_div a",
      image: "#landingImage",
    },
    seller: {
      ownNames: ["amazon"],
      sellerSelector: [
        "[offer-display-feature-name='desktop-merchant-info'] .offer-display-feature-text-message",
        "#merchantInfoFeature_feature_div .offer-display-feature-text-message",
        "#sellerProfileTriggerId",
        "#merchant-info",
      ].join(", "),
      thirdPartyMarkers: ['id="sellerProfileTriggerId"'],
    },
    asinSelector: "input#ASIN",
  },
  {
    match: /(^|\.)worten\.pt$/,
    selectors: {},
    seller: { ownNames: ["worten"], thirdPartyMarkers: ["marketplace-seller"] },
  },
];

export function hostProfile(host: string): HostProfile | undefined {
  return HOST_PROFILES.find((p) => p.match.test(host));
}
