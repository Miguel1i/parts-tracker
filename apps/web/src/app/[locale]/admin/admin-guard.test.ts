/**
 * Proves the admin area is closed to everyone but active admins, on the server:
 * - every export of every `admin/**\/actions.ts` (Server Actions are public POST endpoints)
 *   rejects anonymous, pending, banned and plain `user` callers before touching the DB;
 * - the admin layout and `requireAdmin()` 404 for the same callers and let an admin through.
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
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/auth/server", () => ({
  auth: { api: h.authApi },
  enabledProviders: () => ({ github: false, google: false }),
}));
vi.mock("@parts/db", async (orig) => ({
  ...(await orig<typeof import("@parts/db")>()),
  getDb: h.getDb,
}));
vi.mock("@/lib/email", () => ({
  sendEmail: () => {
    throw new Error("email sent");
  },
  linkEmail: () => ({ html: "", text: "" }),
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

const callers = {
  anonymous: null,
  user: user(),
  pending: user({ status: "pending" }),
  pendingAdmin: user({ role: "admin", status: "pending" }),
  banned: user({ banned: true }),
  bannedAdmin: user({ role: "admin", banned: true }),
};

const modules = import.meta.glob<Record<string, unknown>>("./**/actions.ts", { eager: true });
const actions = Object.entries(modules).flatMap(([file, mod]) =>
  Object.entries(mod).map(([name, fn]) => ({ file, name, fn })),
);

beforeEach(() => {
  h.session = null;
  h.getDb.mockClear();
});

describe("admin Server Actions", () => {
  it("finds the admin action modules", () => {
    const files = Object.keys(modules).sort();
    expect(files).toEqual(
      expect.arrayContaining([
        "./catalog/actions.ts",
        "./merchants/actions.ts",
        "./review/actions.ts",
        "./users/actions.ts",
      ]),
    );
    expect(actions.length).toBeGreaterThan(15);
  });

  it("exports only functions", () => {
    for (const { file, name, fn } of actions) {
      expect(typeof fn, `${file} ${name}`).toBe("function");
    }
  });

  describe.each(Object.entries(callers))("as %s", (_label, session) => {
    it.each(actions.map((a) => [`${a.file} ${a.name}`, a.fn] as const))(
      "%s is forbidden and never reaches the DB",
      async (_name, fn) => {
        h.session = session;
        const valid = { id: "x", userId: "x", mode: "open", email: "a@b.co", name: "n" };
        await expect((fn as (i: unknown) => Promise<unknown>)(valid)).rejects.toThrow("Forbidden");
        expect(h.getDb).not.toHaveBeenCalled();
      },
    );
  });

  it("lets an active admin past the guard (invalid input is reported, not thrown)", async () => {
    h.session = user({ role: "admin" });
    for (const { file, name, fn } of actions) {
      const result = await (fn as (i: unknown) => Promise<{ ok: boolean }>)({ "": null });
      expect(result.ok, `${file} ${name}`).toBe(false);
    }
  });
});

describe("admin pages", () => {
  it.each(Object.entries(callers))("requireAdmin 404s for %s", async (_label, session) => {
    const { requireAdmin } = await import("@/lib/auth/guard");
    h.session = session;
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it.each(Object.entries(callers))(
    "the admin layout 404s for %s before loading data",
    async (_label, session) => {
      const { default: AdminLayout } = await import("./layout");
      h.session = session;
      await expect(AdminLayout({ children: null } as never)).rejects.toThrow("NEXT_NOT_FOUND");
      expect(h.getDb).not.toHaveBeenCalled();
    },
  );

  it("the admin layout renders for an active admin", async () => {
    const { default: AdminLayout } = await import("./layout");
    h.session = user({ role: "admin" });
    h.getDb.mockImplementationOnce(
      () =>
        ({
          $count: async () => 0,
        }) as never,
    );
    await expect(AdminLayout({ children: null } as never)).resolves.toBeTruthy();
  });
});
