/**
 * Proves signed-in user Server Actions (builds, account) refuse anyone who isn't an active,
 * unbanned user before touching the DB. Ownership (another user's build) is tested separately
 * in src/lib/builds; this file covers the session gate for every exported action.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  session: null as null | { user: Record<string, unknown>; session: Record<string, unknown> },
  getDb: vi.fn(() => {
    throw new Error("DB touched");
  }),
  authApi: new Proxy(
    {},
    {
      get: (_t, name) =>
        name === "getSession"
          ? async () => h.session
          : () => {
              throw new Error(`auth.api.${String(name)} called`);
            },
    },
  ),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/root-params", () => ({ locale: async () => "en" }));
vi.mock("@/i18n/server", () => ({ initLocale: async () => "en" }));
vi.mock("@/lib/auth/server", () => ({ auth: { api: h.authApi } }));
vi.mock("@parts/db", async (orig) => ({
  ...(await orig<typeof import("@parts/db")>()),
  getDb: h.getDb,
}));
vi.mock("@/lib/admin/github", () => ({
  dispatchScrape: () => {
    throw new Error("dispatched");
  },
}));

const user = (over: Record<string, unknown> = {}) => ({
  user: {
    id: "u1",
    name: "U",
    email: "u@example.com",
    role: "user",
    status: "active",
    banned: false,
    ...over,
  },
  session: { id: "s1" },
});

const refused = {
  anonymous: null,
  pending: user({ status: "pending" }),
  banned: user({ banned: true }),
  bannedAdmin: user({ role: "admin", banned: true }),
};

const modules = import.meta.glob<Record<string, unknown>>(["./**/actions.ts", "!./admin/**"], {
  eager: true,
});
const actions = Object.entries(modules).flatMap(([file, mod]) =>
  Object.entries(mod).map(([name, fn]) => ({ file, name, fn })),
);

beforeEach(() => {
  h.session = null;
  h.getDb.mockClear();
});

describe("user Server Actions", () => {
  it("finds the builds and account action modules", () => {
    const files = Object.keys(modules).join(" ");
    expect(files).toContain("./builds/");
    expect(files).toContain("./account/");
    for (const { file, name, fn } of actions) expect(typeof fn, `${file} ${name}`).toBe("function");
  });

  describe.each(Object.entries(refused))("as %s", (_label, session) => {
    it.each(actions.map((a) => [`${a.file} ${a.name}`, a.fn] as const))(
      "%s is forbidden and never reaches the DB",
      async (_name, fn) => {
        h.session = session;
        await expect(
          (fn as (i: unknown) => Promise<unknown>)({ buildId: "b", id: "x" }),
        ).rejects.toThrow("Forbidden");
        expect(h.getDb).not.toHaveBeenCalled();
      },
    );
  });

  it("lets an active user past the gate (invalid input is reported, not thrown)", async () => {
    h.session = user();
    for (const { file, name, fn } of actions) {
      const result = await (fn as (i: unknown) => Promise<{ ok: boolean }>)({ "": null });
      // Actions without required input may reach the (mocked, throwing) DB: that's a generic error.
      expect(result.ok, `${file} ${name}`).toBe(false);
    }
  });
});
