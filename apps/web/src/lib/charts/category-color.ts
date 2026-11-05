/** CSS colour for a chart category slot: 1-8 categorical, 0 (other) neutral grey. */
export function categoryColor(slot: number): string {
  return slot > 0 ? `var(--chart-merchant-${slot})` : "var(--muted-foreground)";
}
