import { ConvexError } from "convex/values"

/**
 * Stable error codes the UI maps to messages. Never branch on error text.
 * NOT_FOUND also covers records the caller may not see, so errors don't
 * reveal whether something exists.
 */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "SERVICE_NOT_ON_RESOURCE"
  | "IN_PAST"
  | "OUTSIDE_HOURS"
  | "SLOT_TAKEN"
  | "INVALID_TRANSITION"
  | "INVALID_TAJ"
  | "DUPLICATE_TAJ"
  | "NOT_SYNTHETIC_DEPLOYMENT"

export function fail(code: ErrorCode): never {
  throw new ConvexError({ code })
}
