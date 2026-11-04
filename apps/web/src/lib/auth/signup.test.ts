import { describe, expect, it } from "vitest";
import { decideSignup, usableInvite, type InviteRow } from "./signup";

const now = new Date("2026-11-04T12:00:00Z");
const invite = (over: Partial<InviteRow> = {}): InviteRow => ({
  id: "i1",
  email: "new@example.com",
  role: "user",
  expiresAt: new Date("2026-11-10"),
  usedAt: null,
  ...over,
});

describe("usableInvite", () => {
  it("matches the same email case-insensitively", () => {
    expect(usableInvite([invite()], " NEW@example.com ", now)?.id).toBe("i1");
  });
  it.each([
    ["used", invite({ usedAt: new Date("2026-11-02") })],
    ["expired", invite({ expiresAt: new Date("2026-11-03") })],
    ["for another email", invite({ email: "other@example.com" })],
  ])("ignores an invite that is %s", (_label, row) => {
    expect(usableInvite([row], "new@example.com", now)).toBeUndefined();
  });
});

describe("decideSignup", () => {
  it.each([
    ["open", { ok: true, status: "active", role: "user" }],
    ["approval", { ok: true, status: "pending", role: "user" }],
    ["invite_only", { ok: false, error: "invite_required" }],
  ] as const)("%s without an invite", (mode, expected) => {
    expect(decideSignup({ mode, invite: undefined })).toEqual(expected);
  });

  it.each(["open", "approval", "invite_only"] as const)(
    "%s with an invite: active, with the invite's role",
    (mode) => {
      expect(decideSignup({ mode, invite: invite({ role: "admin" }) })).toEqual({
        ok: true,
        status: "active",
        role: "admin",
        inviteId: "i1",
      });
    },
  );

  it("accounts created by an admin skip approval", () => {
    expect(decideSignup({ mode: "invite_only", invite: undefined, createdByAdmin: true })).toEqual({
      ok: true,
      status: "active",
      role: "user",
    });
  });
});
