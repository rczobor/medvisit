import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    // The app renders client-side only (see __root.tsx), so the build is
    // static files plus a `_shell.html` that every route falls back to.
    tanstackStart({ spa: { enabled: true } }),
    viteReact(),
  ],
})
