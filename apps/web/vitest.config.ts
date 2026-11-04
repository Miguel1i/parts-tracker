import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: `${fileURLToPath(new URL("./src", import.meta.url))}/$1` },
      {
        find: /^server-only$/,
        replacement: fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "node",
    // next-intl's ESM build imports `next/navigation` without an extension; let Vite resolve it.
    server: { deps: { inline: ["next-intl"] } },
    include: ["src/**/*.test.ts", "messages/**/*.test.ts", "test/**/*.test.ts"],
  },
});
