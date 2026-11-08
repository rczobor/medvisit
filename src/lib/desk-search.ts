import type { Id } from "../../convex/_generated/dataModel"
import { isLocalDate } from "../../convex/lib/time"
import type { LocalDate } from "../../convex/lib/time"

/**
 * URL state of the front desk: which site and day are open, and which sheet.
 * Keeping it in the URL makes every view linkable and lets Back close a sheet.
 */
export type DeskSearch = {
  site?: Id<"sites">
  date?: LocalDate
  /** Open appointment details. */
  appointment?: Id<"appointments">
  /** Open the booking sheet, for a resource or for any ("any"). */
  book?: Id<"resources"> | "any"
  /** Preferred start time for the booking sheet, `HH:MM`. */
  at?: string
  /** Open the booking sheet to move this appointment to a new time. */
  move?: Id<"appointments">
  /** Open a patient's card, or patient search ("search"). */
  patient?: Id<"patients"> | "search"
  /** The patient a new booking is for, chosen before the sheet opened. */
  for?: Id<"patients">
}

const text = (value: unknown) =>
  typeof value === "string" && value !== "" ? value : undefined

/**
 * The trust boundary for URL state. Ids are only shaped here; the backend
 * validates them, and stale ids resolve to nothing rather than to an error.
 */
export function validateDeskSearch(
  search: Record<string, unknown>
): DeskSearch {
  const date = text(search.date)
  const at = text(search.at)
  return {
    site: text(search.site) as Id<"sites"> | undefined,
    date: date && isLocalDate(date) ? date : undefined,
    appointment: text(search.appointment) as Id<"appointments"> | undefined,
    book: text(search.book) as Id<"resources"> | "any" | undefined,
    at: at && /^([01]\d|2[0-3]):[0-5]\d$/.test(at) ? at : undefined,
    move: text(search.move) as Id<"appointments"> | undefined,
    patient: text(search.patient) as Id<"patients"> | "search" | undefined,
    for: text(search.for) as Id<"patients"> | undefined,
  }
}
