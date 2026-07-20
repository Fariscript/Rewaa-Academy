import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Test files share one real Postgres DB and fixture rows (trainee@/
    // admin@example.com, seeded taxonomy). Vitest runs files concurrently
    // by default, which produces cross-file races on that shared state —
    // caught once already as an exact-match assertion racing another
    // file's ephemeral fixture user (fixed at the call site), and again as
    // an intermittent, not-fully-isolated failure in the quiz-engine tests
    // after this repo grew enough files to make the timing likely. Rather
    // than keep hunting each new interaction, run files sequentially — the
    // suite is small enough that it costs nothing worth trading
    // determinism for.
    fileParallelism: false,
    server: {
      deps: {
        inline: [/next-auth/, /@auth\/core/, /^next\//, /next\/server/],
      },
    },
  },
});
