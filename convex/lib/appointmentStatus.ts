export const appointmentStatuses = [
  "booked",
  "arrived",
  "completed",
  "noShow",
  "cancelled",
] as const

export type AppointmentStatus = (typeof appointmentStatuses)[number]

/**
 * Allowed status changes. The reverse moves exist so the front desk can undo a
 * mis-click; cancelling is final because the slot may already be rebooked.
 */
const transitions: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  booked: ["arrived", "noShow", "cancelled"],
  arrived: ["completed", "booked"],
  completed: ["arrived"],
  noShow: ["booked"],
  cancelled: [],
}

export function canTransition(from: AppointmentStatus, to: AppointmentStatus) {
  return transitions[from].includes(to)
}

export function nextStatuses(from: AppointmentStatus) {
  return transitions[from]
}

/** Whether an appointment in this status keeps its time slot taken. */
export function occupiesSlot(status: AppointmentStatus) {
  return status === "booked" || status === "arrived" || status === "completed"
}

export function isAppointmentStatus(
  value: unknown
): value is AppointmentStatus {
  return appointmentStatuses.some((status) => status === value)
}
