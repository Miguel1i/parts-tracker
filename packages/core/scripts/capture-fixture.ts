/**
 * Captures a page as a trimmed HTML fixture for the matching tests (dev only; not part of
 * @parts/core's runtime). Keeps what the extractors read — JSON-LD, small app-state JSON, meta
 * tags, titles, prices, seller and breadcrumb blocks, product links — and drops the rest.
 *
 *   pnpm --filter @parts/core fixture:capture <url> <out.html>
 *   pnpm --filter @parts/core fixture:capture --file <saved.html> <url> <out.html>
 *
 * Use `--file` for pages that block plain fetches (Amazon, Worten, PCDiga): save them from a
 * normal browser ("Save page as → Webpage, HTML only") and trim the saved file.
 */
import { load } from "cheerio";
import { readFileSync, writeFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const KEEP_ATTRS = new Set([
  "id",
  "class",
  "href",
  "alt",
  "title",
  "content",
  "property",
  "name",
  "itemprop",
  "itemtype",
  "itemscope",
  "type",
  "value",
  "rel",
  "aria-label",
  "data-asin",
  "data-component-type",
  "offer-display-feature-name",
]);
const DROP =
  "style, link, noscript, svg, iframe, video, picture source, template, canvas, form select";

/** Page furniture that no extractor reads: menus, footers, carousels, reviews, A+ content. */
const FURNITURE = [
  "header",
  "footer",
  "nav:not([aria-label*='bread' i]):not([class*='bread'])",
  "[class*='menu']:not([class*='bread'])",
  "[id*='menu']",
  "[class*='footer']",
  "[id*='footer' i]",
  "[class*='carousel']",
  "[id*='carousel' i]",
  "[class*='newsletter']",
  "[class*='cookie']",
  "[id*='cookie' i]",
  "[id^='CybotCookiebot']",
  "[id*='review' i]",
  "[class*='review']",
  "#aplus",
  "#aplus_feature_div",
  "[id^='nav-']",
  "#rhf",
  "[id*='sims' i]",
  "[id*='similarities' i]",
  "[class*='filter']",
  "[class*='facet']",
].join(", ");
const TEXT_LIMIT = 300;

export function trimHtml(html: string, url: string): string {
  const $ = load(html);
  $(DROP).remove();
  // Keep breadcrumbs even when a shop puts them inside a header/nav.
  const crumbs = $("[class*='breadcrumb'], [id*='breadcrumb'], nav[aria-label*='bread' i]").clone();
  $(FURNITURE).remove();
  if (crumbs.length && !$("[class*='breadcrumb'], [id*='breadcrumb']").length)
    $("body").prepend(crumbs);
  $("script").each((_, el) => {
    const s = $(el);
    const type = s.attr("type") ?? "";
    const text = s.text().trim();
    const keep =
      type === "application/ld+json" ||
      ((type === "application/json" || s.attr("id") === "__NEXT_DATA__") && text.length < 200_000);
    if (!keep) s.remove();
  });
  $("*").each((_, el) => {
    if (el.type !== "tag") return;
    for (const name of Object.keys(el.attribs)) {
      if (!KEEP_ATTRS.has(name)) delete el.attribs[name];
      else if (name === "class")
        el.attribs[name] = el.attribs[name]!.split(/\s+/).slice(0, 4).join(" ");
    }
  });
  $("*")
    .contents()
    .each((_, node) => {
      if (node.type === "comment") $(node).remove();
      else if (
        node.type === "text" &&
        node.parent?.type === "tag" &&
        node.parent.name !== "script"
      ) {
        const t = node.data.replace(/\s+/g, " ");
        node.data = t.length > TEXT_LIMIT ? `${t.slice(0, TEXT_LIMIT)}…` : t;
      }
    });
  // Empty wrappers left behind by removed scripts/images.
  for (let pass = 0; pass < 3; pass++)
    $("div, span, li, ul, section").each((_, el) => {
      const e = $(el);
      if (!e.children().length && !e.text().trim() && !e.attr("id")) e.remove();
    });
  const body = ($("html").html() ?? "").replace(/\n\s*\n+/g, "\n").replace(/[ \t]{2,}/g, " ");
  return `<!-- fixture: ${url} captured ${new Date().toISOString().slice(0, 10)} (trimmed) -->\n<html>${body}</html>\n`;
}

async function main() {
  const args = process.argv.slice(2);
  let file: string | undefined;
  if (args[0] === "--file") {
    file = args[1];
    args.splice(0, 2);
  }
  const [url, out] = args;
  if (!url || !out) {
    console.error("usage: capture-fixture [--file saved.html] <url> <out.html>");
    process.exit(1);
  }
  let html: string;
  if (file) html = readFileSync(file, "utf8");
  else {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
        Accept: "text/html",
      },
    });
    if (!res.ok) {
      console.error(`HTTP ${res.status} for ${url}: save the page from a browser and use --file`);
      process.exit(1);
    }
    html = await res.text();
  }
  const trimmed = trimHtml(html, url);
  writeFileSync(out, trimmed);
  console.log(
    `${out}: ${Math.round(html.length / 1024)} KB → ${Math.round(trimmed.length / 1024)} KB`,
  );
}

if (process.argv[1] && /capture-fixture/.test(process.argv[1])) await main();
