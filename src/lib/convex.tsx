import { useState } from "react"
import { ClerkProvider, SignIn, useAuth } from "@clerk/react"
import { huHU } from "@clerk/localizations"
import {
  AuthLoading,
  Authenticated,
  ConvexProvider,
  ConvexReactClient,
  Unauthenticated,
} from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"
import { Spinner } from "@/components/ui/spinner"

function convexUrl() {
  const url: unknown = import.meta.env.VITE_CONVEX_URL
  if (typeof url !== "string" || url === "") {
    throw new Error("VITE_CONVEX_URL is not set. See README: Local setup.")
  }
  return url
}

const clerkKeyEnv: unknown = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const clerkKey =
  typeof clerkKeyEnv === "string" && clerkKeyEnv !== "" ? clerkKeyEnv : null

/**
 * Staff sign in with Clerk when the build has a publishable key. Without one
 * (local development) no token is sent, and only a backend that allows the
 * demo without sign-in answers.
 */
export const signInEnabled = clerkKey !== null

export function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode
}) {
  // ConvexProviderWithClerk takes Clerk's `useAuth` hook as a prop, so React
  // Compiler can't compile this. Opt out explicitly; it renders once anyway.
  "use no memo"
  const [client] = useState(() => new ConvexReactClient(convexUrl()))
  if (clerkKey === null) {
    return <ConvexProvider client={client}>{children}</ConvexProvider>
  }
  return (
    <ClerkProvider publishableKey={clerkKey} localization={huHU}>
      <ConvexProviderWithClerk client={client} useAuth={useAuth}>
        <AuthLoading>
          <div className="grid h-dvh place-items-center">
            <Spinner className="size-6 text-muted-foreground" />
          </div>
        </AuthLoading>
        <Unauthenticated>
          <main className="grid min-h-dvh place-items-center p-4">
            <SignIn routing="hash" />
          </main>
        </Unauthenticated>
        <Authenticated>{children}</Authenticated>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}
