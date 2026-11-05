import { describe, expect, it } from "vitest";
import { decideCronRun } from "../src/cron";

const H = 3_600_000;
const now = Date.UTC(2026, 10, 5, 12, 17);

describe("decideCronRun", () => {
  it("never skips manual runs", () => {
    expect(
      decideCronRun({ trigger: "manual", now, lastCronStartedAt: now - 1000, intervalHours: 24 })
        .skip,
    ).toBe(false);
  });
  it("runs when there is no earlier cron run", () => {
    expect(
      decideCronRun({ trigger: "cron", now, lastCronStartedAt: null, intervalHours: 6 }).skip,
    ).toBe(false);
  });
  it("skips while the interval has not passed", () => {
    expect(
      decideCronRun({ trigger: "cron", now, lastCronStartedAt: now - 5 * H, intervalHours: 6 })
        .skip,
    ).toBe(true);
  });
  it("allows 10 minutes of slack", () => {
    const at = (min: number) =>
      decideCronRun({
        trigger: "cron",
        now,
        lastCronStartedAt: now - min * 60_000,
        intervalHours: 6,
      }).skip;
    expect(at(6 * 60 - 11)).toBe(true);
    expect(at(6 * 60 - 10)).toBe(false);
    expect(at(7 * 60)).toBe(false);
  });
  it("runs every hour at interval 1", () => {
    expect(
      decideCronRun({
        trigger: "cron",
        now,
        lastCronStartedAt: now - 55 * 60_000,
        intervalHours: 1,
      }).skip,
    ).toBe(false);
  });
});
