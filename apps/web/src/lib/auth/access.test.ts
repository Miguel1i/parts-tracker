import { describe, expect, it } from "vitest";
import { evaluateAccess, type AccessUser } from "./access";

const now = new Date("2026-11-04T12:00:00Z");
const base: AccessUser = { id: "u1", role: "user", status: "active", banned: false };
const admin: AccessUser = { ...base, role: "admin" };

describe("evaluateAccess", () => {
  it.each([
    ["anonymous", null, "user", "unauthenticated"],
    ["anonymous", null, "admin", "unauthenticated"],
    ["user", base, "user", "ok"],
    ["user", base, "admin", "forbidden"],
    ["admin", admin, "admin", "ok"],
    ["admin", admin, "user", "ok"],
    ["pending user", { ...base, status: "pending" }, "user", "pending"],
    ["pending admin", { ...admin, status: "pending" }, "admin", "pending"],
    ["banned user", { ...base, banned: true }, "user", "banned"],
    ["banned admin", { ...admin, banned: true }, "admin", "banned"],
    ["missing role", { ...base, role: undefined }, "admin", "forbidden"],
    ["role with other casing", { ...base, role: "Admin" }, "admin", "forbidden"],
    ["missing status", { ...admin, status: undefined }, "admin", "pending"],
  ] as const)("%s needing %s → %s", (_label, user, need, expected) => {
    expect(evaluateAccess(user, need, now)).toBe(expected);
  });

  it("lets a user back in once a timed ban expires", () => {
    const expired = { ...base, banned: true, banExpires: new Date("2026-11-01") };
    const active = { ...base, banned: true, banExpires: new Date("2026-12-01") };
    expect(evaluateAccess(expired, "user", now)).toBe("ok");
    expect(evaluateAccess(active, "user", now)).toBe("banned");
  });
});
