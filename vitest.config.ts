import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // The Convex runtime is not Node; edge-runtime is the closest match and is
    // what convex-test expects.
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
  },
})
