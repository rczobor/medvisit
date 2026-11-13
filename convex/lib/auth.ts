import type { Doc } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"
import { fail } from "./errors"

/**
 * Marks a deployment that holds only synthetic data. Anyone who can sign in
 * acts as the demo receptionist, and the demo seed may wipe data. Never set
 * it where real patient data exists.
 */
export function isSyntheticDemo() {
  return process.env.MEDVISIT_SYNTHETIC_DEMO === "true"
}

/**
 * Also lets callers without a sign-in act as the demo receptionist, for local
 * development and screenshots. Only on synthetic deployments that nobody else
 * can reach: the hosted demo leaves it unset.
 */
function allowsDemoWithoutSignIn() {
  return (
    isSyntheticDemo() && process.env.MEDVISIT_DEMO_WITHOUT_SIGN_IN === "true"
  )
}

/** No JWT issuer produces this, so only the demo path can resolve it. */
export const DEMO_TOKEN_IDENTIFIER = "synthetic-demo|reception"

export async function requireStaff(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity && !allowsDemoWithoutSignIn()) fail("UNAUTHENTICATED")
  const staffFor = (tokenIdentifier: string) =>
    ctx.db
      .query("staff")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", tokenIdentifier)
      )
      .unique()
  const staff =
    (identity && (await staffFor(identity.tokenIdentifier))) ??
    // Clerk only lets invited people sign in, so on synthetic data each of
    // them shares the demo receptionist instead of needing a staff record.
    (isSyntheticDemo() ? await staffFor(DEMO_TOKEN_IDENTIFIER) : null)
  if (!staff) fail("FORBIDDEN")
  return staff
}

/**
 * Whether staff may change when calendars work: weekly hours and extra
 * openings. The demo identity counts as an admin so people trying the demo
 * can use these tools; it only resolves on synthetic deployments.
 */
export function isAdmin(staff: Doc<"staff">) {
  return (
    staff.role === "admin" || staff.tokenIdentifier === DEMO_TOKEN_IDENTIFIER
  )
}

export async function requireAdmin(ctx: QueryCtx) {
  const staff = await requireStaff(ctx)
  if (!isAdmin(staff)) fail("FORBIDDEN")
  return staff
}
