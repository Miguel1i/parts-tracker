/**
 * Merchant colours for charts. Identity follows the merchant, never its rank in a chart: the
 * slot comes from the merchant's position in the admin order (sortOrder, then name), so a
 * merchant keeps its colour on every chart and filtering never repaints the others. The eight
 * hues are the validated categorical palette (CSS vars --chart-merchant-1..8, light and dark
 * steps in globals.css). From the ninth merchant on, hues repeat with a dashed stroke
 * (composite encoding) instead of inventing a ninth hue.
 */
export const PALETTE_SIZE = 8;

export type MerchantStyle = {
  /** 1-based palette slot. */
  slot: number;
  /** CSS colour, e.g. `var(--chart-merchant-3)`. */
  color: string;
  /** SVG stroke-dasharray for merchants past the eighth, else undefined. */
  dash?: string;
};

export function styleForIndex(index: number): MerchantStyle {
  const slot = (index % PALETTE_SIZE) + 1;
  return {
    slot,
    color: `var(--chart-merchant-${slot})`,
    ...(index >= PALETTE_SIZE ? { dash: "6 4" } : {}),
  };
}

/** Styles for every merchant, keyed by id, from the full admin-ordered merchant list. */
export function merchantStyles(
  merchants: { id: string; sortOrder: number; name: string }[],
): Map<string, MerchantStyle> {
  const ordered = [...merchants].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
  return new Map(ordered.map((m, i) => [m.id, styleForIndex(i)]));
}
