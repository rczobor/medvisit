import { createContext, use } from "react"
import type { Id } from "../../convex/_generated/dataModel"
import type { LocalDate } from "../../convex/lib/time"

/** The slot being booked in the booking sheet, shown on the board behind it. */
export type BookingDraft = {
  resourceId: Id<"resources">
  startAt: number
  endAt: number
}

export type Desk = {
  site: { _id: Id<"sites">; name: string }
  date: LocalDate
  today: LocalDate
  now: number
  /** The appointment whose details are open, if any. */
  selectedAppointment: Id<"appointments"> | null
  openAppointment: (appointmentId: Id<"appointments">) => void
  openBooking: (resourceId?: Id<"resources">, at?: string) => void
  bookingDraft: BookingDraft | null
  setBookingDraft: (draft: BookingDraft | null) => void
}

export const DeskContext = createContext<Desk | null>(null)

export function useDesk() {
  const desk = use(DeskContext)
  if (!desk) throw new Error("useDesk must be used inside the desk layout")
  return desk
}
