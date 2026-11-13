import type { AuthConfig } from "convex/server"

// Staff sign in with Clerk. Its session tokens carry `aud: convex` (a session
// claim set on the Clerk instance), which is what `applicationID` checks. A
// deployment without the issuer, such as the local backend, accepts no tokens.
const domain = process.env.CLERK_JWT_ISSUER_DOMAIN

export default {
  providers: domain ? [{ domain, applicationID: "convex" }] : [],
} satisfies AuthConfig
