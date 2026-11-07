import { ConvexError } from "convex/values"
import type { AppointmentStatus } from "../../convex/lib/appointmentStatus"
import type { ErrorCode } from "../../convex/lib/errors"
import type { AppointmentSource } from "../../convex/validators"

export const statusLabel: Record<AppointmentStatus, string> = {
  booked: "Foglalt",
  arrived: "Megérkezett",
  completed: "Elvégezve",
  noShow: "Nem jelent meg",
  cancelled: "Lemondva",
}

/** Button text for moving an appointment from `from` into `to`. */
export function transitionLabel(
  from: AppointmentStatus,
  to: AppointmentStatus
) {
  if (to === "booked")
    return from === "arrived" ? "Érkezés visszavonása" : "Visszaállítás"
  if (to === "arrived" && from === "completed") return "Visszavonás"
  const labels: Record<Exclude<AppointmentStatus, "booked">, string> = {
    arrived: "Megérkezett",
    completed: "Elvégezve",
    noShow: "Nem jelent meg",
    cancelled: "Lemondás",
  }
  return labels[to]
}

export const historyLabel: Record<AppointmentStatus, string> = {
  booked: "Visszaállítva foglaltra",
  arrived: "Megérkezettnek jelölve",
  completed: "Elvégzettnek jelölve",
  noShow: "Meg nem jelentnek jelölve",
  cancelled: "Lemondva",
}

export const sourceLabel: Record<AppointmentSource, string> = {
  staff: "Recepció",
  online: "Online",
  partner: "Partner",
}

const errorMessages: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Lejárt a bejelentkezés. Jelentkezzen be újra.",
  FORBIDDEN: "Ehhez nincs jogosultsága.",
  NOT_FOUND: "Nem található. Lehet, hogy közben törölték.",
  INVALID_INPUT: "Hiányzó vagy hibás adat. Ellenőrizze a mezőket.",
  SERVICE_NOT_ON_RESOURCE: "Ez a vizsgálat ezen az eszközön nem végezhető.",
  IN_PAST: "Elmúlt időpontra nem lehet foglalni.",
  OUTSIDE_HOURS: "Az időpont kívül esik a rendelési időn.",
  SLOT_TAKEN: "Ezt az időpontot közben lefoglalták. Válasszon másikat.",
  INVALID_TRANSITION: "Ez az állapotváltás most nem lehetséges.",
  INVALID_TAJ: "A TAJ-szám nem érvényes. Ellenőrizze a számjegyeket.",
  DUPLICATE_TAJ:
    "Ezzel a TAJ-számmal már van páciens. Keressen rá név vagy TAJ alapján.",
  NOT_SYNTHETIC_DEPLOYMENT: "Ez a művelet csak demó környezetben futtatható.",
}

function isErrorCode(code: unknown): code is ErrorCode {
  return typeof code === "string" && Object.hasOwn(errorMessages, code)
}

export function errorCode(error: unknown): ErrorCode | null {
  if (!(error instanceof ConvexError)) return null
  const data: unknown = error.data
  if (typeof data !== "object" || data === null || !("code" in data))
    return null
  return isErrorCode(data.code) ? data.code : null
}

export function errorMessage(error: unknown) {
  const code = errorCode(error)
  return code ? errorMessages[code] : "A művelet nem sikerült. Próbálja újra."
}
