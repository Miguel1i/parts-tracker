import { describe, expect, it } from "vitest";
import { merchantStyles, styleForIndex } from "./palette";

describe("merchant chart styles", () => {
  it("assigns slots by admin order and dashes past the eighth", () => {
    expect(styleForIndex(0)).toEqual({ slot: 1, color: "var(--chart-merchant-1)" });
    expect(styleForIndex(8)).toEqual({ slot: 1, color: "var(--chart-merchant-1)", dash: "6 4" });
  });

  it("follows the merchant, not the chart's series order", () => {
    const all = [
      { id: "b", sortOrder: 1, name: "B" },
      { id: "a", sortOrder: 0, name: "A" },
      { id: "c", sortOrder: 2, name: "C" },
    ];
    const styles = merchantStyles(all);
    expect(styles.get("a")!.slot).toBe(1);
    expect(styles.get("c")!.slot).toBe(3);
  });
});
