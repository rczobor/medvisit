import { createContext, use } from "react"
import type { Id } from "../../convex/_generated/dataModel"
import type { LocalDate } from "../../convex/lib/time"

export type Desk = {
  site: { _id: Id<"sites">; name: string }
  date: LocalDate
  today: LocalDate
  now: number
  /** The appointment whose details are open, if any. */
  selectedAppointment: Id<"appointments"> | null
  openAppointment: (appointmentId: Id<"appointments">) => void
  openBooking: (resourceId?: Id<"resources">, at?: string) => void
}

export const DeskContext = createContext<Desk | null>(null)

export function useDesk() {
  const desk = use(DeskContext)
  if (!desk) throw new Error("useDesk must be used inside the desk layout")
  return desk
}
