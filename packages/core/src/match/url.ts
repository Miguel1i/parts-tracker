/** URL helpers: canonical forms, ASINs, search-page and junk-link detection. */

const AMAZON = /^https?:\/\/(?:www\.)?(amazon\.[a-z.]+)\//i;
const ASIN_IN_PATH = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)/i;

/** Query params that only track the click; dropped from canonical URLs. */
const TRACKING =
  /^(utm_\w+|gclid|fbclid|msclkid|srsltid|ref|ref_|tag|dib|dib_tag|qid|sr|crid|sprefix|keywords|th|psc|_ga|mc_\w+|aff\w*|cmp\w*|campaign|source)$/i;

export function asinFromUrl(url: string | null | undefined): string | null {
  const m = url?.match(ASIN_IN_PATH);
  return m ? m[1]!.toUpperCase() : null;
}

/**
 * Canonical form used for blocklist and duplicate checks: Amazon → `https://host/dp/ASIN`;
 * others → lower-case host, no fragment, no tracking params, no trailing slash.
 */
export function canonicalUrl(url: string): string {
  const amazon = url.match(AMAZON);
  const asin = asinFromUrl(url);
  if (amazon && asin) return `https://www.${amazon[1]!.toLowerCase()}/dp/${asin}`;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url.split("#")[0]!;
  }
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
  u.searchParams.sort();
  let s = u.toString();
  if (s.endsWith("/") && u.pathname !== "/" && !u.search) s = s.slice(0, -1);
  return s;
}

const SEARCH_URL =
  /(?:\/(?:search|buscar|busca|pesquisa|recherche|ricerca|suche|catalogsearch|s)(?:\/|\?|$)|[?&](?:q|s|k|query|search|keyword|keywords|text|term)=)/i;
const LISTING_URL =
  /\/(?:categoria|category|categorias|categories|c|marcas|brands?|tag|offer-listing)\//i;

/** A8: URLs that are search or listing pages, not a product. */
export function looksLikeSearchUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let path = url;
  try {
    // Tracking params are dropped first: Amazon result links carry `?keywords=` but are products.
    const u = new URL(canonicalUrl(url));
    path = u.pathname + u.search;
  } catch {
    // relative or malformed: test as is
  }
  return SEARCH_URL.test(path) || LISTING_URL.test(path);
}

const JUNK_SCHEME = /^\s*(?:#|javascript:|mailto:|tel:|sms:|whatsapp:|data:)/i;
const JUNK_PATH =
  /(?:[?&](?:add-to-cart|add_to_cart|add-to-wishlist|remove_item|wishlist|compare)=|admin-ajax\.php|\/(?:cart|carrinho|checkout|basket|cesta|panier|wishlist|lista-de-desejos|login|account|conta|minha-conta|my-account|register|compare|comparar)(?:\/|\?|$))/i;

/** A11: links that are never a product page. */
export function isJunkLink(href: string): boolean {
  return JUNK_SCHEME.test(href) || JUNK_PATH.test(href);
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Path segments of a URL with separators turned into spaces, for slug matching. */
export function slugText(url: string): string {
  let path = url;
  try {
    path = new URL(url, "https://x.invalid").pathname;
  } catch {
    // keep as is
  }
  return decodeURIComponentSafe(path)
    .replace(/[-_/.+]+/g, " ")
    .replace(/\bhtml?\b/g, " ")
    .trim();
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
