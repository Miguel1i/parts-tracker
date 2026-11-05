import { describe, expect, it } from "vitest";
import { decideSignup, usableInvite, type InviteRow } from "./signup";

const now = new Date("2026-11-04T12:00:00Z");
const invite = (over: Partial<InviteRow> = {}): InviteRow => ({
  id: "i1",
  email: "new@example.com",
  token: "tok",
  role: "user",
  expiresAt: new Date("2026-11-10"),
  usedAt: null,
  ...over,
});

describe("usableInvite", () => {
  it("matches its token and the same email, case-insensitively", () => {
    expect(usableInvite([invite()], " NEW@example.com ", "tok", now)?.id).toBe("i1");
  });

  it("is never redeemed by email alone or with another token", () => {
    expect(usableInvite([invite()], "new@example.com", undefined, now)).toBeUndefined();
    expect(usableInvite([invite()], "new@example.com", "other", now)).toBeUndefined();
  });
  it.each([
    ["used", invite({ usedAt: new Date("2026-11-02") })],
    ["expired", invite({ expiresAt: new Date("2026-11-03") })],
    ["for another email", invite({ email: "other@example.com" })],
  ])("ignores an invite that is %s", (_label, row) => {
    expect(usableInvite([row], "new@example.com", "tok", now)).toBeUndefined();
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
