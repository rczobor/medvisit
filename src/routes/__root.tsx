import {
  HeadContent,
  Outlet,
  ScriptOnce,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router"
import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/sonner"
import { ConvexClientProvider } from "@/lib/convex"

import appCss from "../styles.css?url"

// Applies the saved theme before first paint. The app renders client-side
// only, so next-themes' own script would run too late to prevent a flash.
const themeScript = `try{var t=localStorage.getItem("theme")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"}catch(e){}`

export const Route = createRootRoute({
  // An internal tool behind sign-in: nothing to gain from server rendering,
  // and the Convex client is browser-only.
  ssr: false,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "MedVisit" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico" },
    ],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
  notFoundComponent: () => (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="space-y-2">
        <h1 className="text-lg font-semibold">Ez az oldal nem létezik</h1>
        <a
          className="text-sm text-primary underline-offset-4 hover:underline"
          href="/"
        >
          Vissza a napi táblához
        </a>
      </div>
    </main>
  ),
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hu" suppressHydrationWarning>
      <head>
        <ScriptOnce children={themeScript} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootComponent() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ConvexClientProvider>
        <Outlet />
        <Toaster position="bottom-center" />
      </ConvexClientProvider>
    </ThemeProvider>
  )
}
