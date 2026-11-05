import type { LegacyMerchant } from "./legacy";

/**
 * The 12 merchants from the legacy pc_tracker.json, copied verbatim (public shop URLs only).
 * `pnpm db:seed` maps them with `mapLegacy` and upserts them by name.
 */
export const LEGACY_MERCHANTS: Record<string, LegacyMerchant> = {
  Worten: {
    shipping: 0,
    enabled: true,
    search: "https://www.worten.pt/search?query={q}&f.seller_id=Worten",
    currency: "EUR",
    own_only: true,
  },
  "Radio Popular": {
    shipping: 0,
    enabled: true,
    search: "https://www.radiopopular.pt/pesquisa/{q}",
    currency: "EUR",
  },
  Globaldata: {
    shipping: 0,
    enabled: true,
    search: "https://www.globaldata.pt/search?q={q}&search-button=&lang=pt_PT",
    currency: "EUR",
  },
  "Amazon.es": {
    shipping: 0,
    enabled: true,
    search: "https://www.amazon.es/s?k={q}",
    currency: "EUR",
  },
  "Amazon.fr": {
    shipping: 0,
    enabled: false,
    search: "https://www.amazon.fr/s?k={q}",
    currency: "EUR",
  },
  "PCComponentes PT": {
    shipping: 0,
    enabled: true,
    search: "https://www.pccomponentes.pt/search/?query={q}",
    currency: "EUR",
  },
  "PCComponentes FR": {
    shipping: 0,
    enabled: true,
    search: "https://www.pccomponentes.fr/recherche/?query={q}",
    currency: "EUR",
  },
  PCDiga: {
    shipping: 17,
    enabled: true,
    search: "https://www.pcdiga.com/search?query={q}",
    currency: "EUR",
  },
  PCBem: {
    shipping: 0,
    enabled: true,
    search: "https://www.pcbem.pt/?s={q}&post_type=product",
    currency: "EUR",
  },
  Chipman: {
    shipping: 0,
    enabled: true,
    search: "https://chipman.pt/pesquisa?q={q}",
    currency: "EUR",
  },
  "PCComponentes Global": {
    shipping: 0,
    enabled: true,
    search: "https://www.pccomponentes.com/search/?query={q}",
    currency: "EUR",
  },
  "Amazon.co.uk": {
    shipping: 0,
    enabled: false,
    search: "https://www.amazon.co.uk/s?k={q}",
    currency: "GBP",
  },
};

/**
 * Shops whose public storefront API the scraper uses instead of their (bot-walled) HTML,
 * by base-URL host. Applied by `seed` and by migration 0006 (for existing databases).
 */
export const STOREFRONT_APIS: Record<string, { saleor: { endpoint: string; channel: string } }> = {
  "www.pcdiga.com": {
    saleor: {
      endpoint: "https://pcdiga-prod.eu.saleor.cloud/graphql/",
      channel: "default-channel",
    },
  },
};
