import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    server: {
      deps: {
        inline: [/next-auth/, /@auth\/core/, /^next\//, /next\/server/],
      },
    },
  },
});
