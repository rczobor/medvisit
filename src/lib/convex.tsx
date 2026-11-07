import { useState } from "react"
import { ConvexProvider, ConvexReactClient } from "convex/react"

function convexUrl() {
  const url: unknown = import.meta.env.VITE_CONVEX_URL
  if (typeof url !== "string" || url === "") {
    throw new Error("VITE_CONVEX_URL is not set. See README: Local setup.")
  }
  return url
}

// Staff sign-in (Clerk) is not wired yet. Until then the backend only answers
// when the deployment is marked synthetic, so this provider sends no token.
export function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [client] = useState(() => new ConvexReactClient(convexUrl()))
  return <ConvexProvider client={client}>{children}</ConvexProvider>
}
