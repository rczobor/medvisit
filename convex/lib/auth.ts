import type { QueryCtx } from "../_generated/server"
import { fail } from "./errors"

/**
 * Marks a deployment that holds only synthetic data. It lets callers without
 * a sign-in act as the demo receptionist and allows the demo seed to wipe
 * data. Never set it where real patient data exists. Staff sign-in (Clerk)
 * replaces the demo identity before real use.
 */
export function isSyntheticDemo() {
  return process.env.MEDVISIT_SYNTHETIC_DEMO === "true"
}

/** No JWT issuer produces this, so only the demo path can resolve it. */
export const DEMO_TOKEN_IDENTIFIER = "synthetic-demo|reception"

export async function requireStaff(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity()
  const tokenIdentifier =
    identity?.tokenIdentifier ??
    (isSyntheticDemo() ? DEMO_TOKEN_IDENTIFIER : null)
  if (!tokenIdentifier) fail("UNAUTHENTICATED")
  const staff = await ctx.db
    .query("staff")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", tokenIdentifier)
    )
    .unique()
  if (!staff) fail("FORBIDDEN")
  return staff
}
