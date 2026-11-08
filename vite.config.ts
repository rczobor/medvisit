import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
  // The on-prem demo serves the build with `vite preview` and passes `/convex`
  // through to its own Convex backend, so browsers need only one address.
  preview: {
    allowedHosts: [".ts.net"],
    proxy: {
      "/convex": {
        target: process.env.MEDVISIT_CONVEX_UPSTREAM ?? "http://127.0.0.1:3410",
        ws: true,
        rewrite: (path) => path.replace(/^\/convex/, ""),
      },
    },
  },
})
