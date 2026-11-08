import { createContext, use } from "react"
import type { Id } from "../../convex/_generated/dataModel"
import type { LocalDate } from "../../convex/lib/time"

/** The slot being booked in the booking sheet, shown on the board behind it. */
export type BookingDraft = {
  resourceId: Id<"resources">
  startAt: number
  endAt: number
  /** The appointment being moved, which the board shows faded. */
  moving?: Id<"appointments">
}

export type Desk = {
  site: { _id: Id<"sites">; name: string }
  date: LocalDate
  today: LocalDate
  now: number
  /** The appointment whose details are open, if any. */
  selectedAppointment: Id<"appointments"> | null
  /** Opens an appointment; with `on`, also shows its site and day. */
  openAppointment: (
    appointmentId: Id<"appointments">,
    on?: { site: Id<"sites">; date: LocalDate }
  ) => void
  openBooking: (
    resourceId?: Id<"resources">,
    at?: string,
    patientId?: Id<"patients">
  ) => void
  /** Opens a patient's card, or patient search. */
  openPatient: (target: Id<"patients"> | "search") => void
  /** Opens the booking sheet to move a booked appointment. */
  openMove: (appointmentId: Id<"appointments">) => void
  bookingDraft: BookingDraft | null
  setBookingDraft: (draft: BookingDraft | null) => void
}

export const DeskContext = createContext<Desk | null>(null)

export function useDesk() {
  const desk = use(DeskContext)
  if (!desk) throw new Error("useDesk must be used inside the desk layout")
  return desk
}
