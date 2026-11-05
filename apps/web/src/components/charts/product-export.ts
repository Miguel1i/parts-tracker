/** Browser-only helpers to download a chart as PNG or the visible data as CSV. */

const STYLE_PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-linejoin",
  "stroke-linecap",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
] as const;

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, filename: string, mime = "text/csv;charset=utf-8") {
  downloadBlob(new Blob(["﻿" + text], { type: mime }), filename);
}

/** Safe file name stem from a product name. */
export function fileStem(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .toLowerCase() || "chart"
  );
}

/**
 * Renders a chart's SVG to a PNG. CSS variables and theme colours are resolved to concrete values
 * first (a standalone SVG image can't see the page's custom properties).
 */
export async function exportSvgPng(svg: SVGSVGElement, filename: string, title: string) {
  const rect = svg.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const from = [svg, ...Array.from(svg.querySelectorAll<SVGElement>("*"))];
  const to = [clone, ...Array.from(clone.querySelectorAll<SVGElement>("*"))];
  from.forEach((el, i) => {
    const target = to[i];
    if (!target) return;
    const cs = getComputedStyle(el);
    for (const prop of STYLE_PROPS) target.style.setProperty(prop, cs.getPropertyValue(prop));
  });
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("render failed"));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  });
  const scale = 2;
  const head = 32;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = (height + head) * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.scale(scale, scale);
  const body = getComputedStyle(document.body);
  ctx.fillStyle = body.backgroundColor;
  ctx.fillRect(0, 0, width, height + head);
  ctx.fillStyle = body.color;
  ctx.font = `600 14px ${body.fontFamily}`;
  ctx.textBaseline = "middle";
  ctx.fillText(title, 12, head / 2 + 2, width - 24);
  ctx.drawImage(img, 0, head, width, height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("encode failed");
  downloadBlob(blob, filename);
}
