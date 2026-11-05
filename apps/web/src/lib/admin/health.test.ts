import { describe, expect, it } from "vitest";
import { dailyHealth, runDurations } from "./health";

const now = Date.UTC(2026, 10, 5, 12);

describe("dailyHealth", () => {
  it("returns one entry per day, oldest first, zero-filled", () => {
    const days = dailyHealth([], now, 30);
    expect(days).toHaveLength(30);
    expect(days[0]!.day).toBe("2026-10-07");
    expect(days[29]!.day).toBe("2026-11-05");
    expect(days[5]!.total).toBe(0);
    expect(days[5]!.shares.ok).toBe(0);
  });
  it("counts statuses per day and computes shares", () => {
    const d = (day: string, h = 3) => new Date(`${day}T0${h}:00:00Z`);
    const days = dailyHealth(
      [
        { createdAt: d("2026-11-05"), status: "ok" },
        { createdAt: d("2026-11-05", 5), status: "ok" },
        { createdAt: d("2026-11-05"), status: "blocked" },
        { createdAt: d("2026-11-05"), status: "error" },
        { createdAt: d("2026-11-04"), status: "not_found" },
        { createdAt: d("2026-01-01"), status: "ok" },
      ],
      now,
    );
    const today = days[29]!;
    expect(today.total).toBe(4);
    expect(today.counts).toMatchObject({ ok: 2, blocked: 1, error: 1, not_found: 0 });
    expect(today.shares.ok).toBe(0.5);
    expect(Object.values(today.shares).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(days[28]!.counts.not_found).toBe(1);
    expect(days.reduce((n, x) => n + x.total, 0)).toBe(5);
  });
});

describe("runDurations", () => {
  it("measures finished runs in minutes, oldest first", () => {
    const at = (s: string) => new Date(s);
    const out = runDurations([
      { id: "b", startedAt: at("2026-11-05T10:00:00Z"), finishedAt: at("2026-11-05T10:12:30Z") },
      { id: "a", startedAt: at("2026-11-04T10:00:00Z"), finishedAt: at("2026-11-04T10:03:00Z") },
      { id: "x", startedAt: at("2026-11-04T11:00:00Z"), finishedAt: null },
      { id: "y", startedAt: null, finishedAt: at("2026-11-04T11:00:00Z") },
    ]);
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
    expect(out.map((r) => r.minutes)).toEqual([3, 12.5]);
  });
});
