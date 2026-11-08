import { useState } from "react"
import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { todayInClinic } from "../../convex/lib/time"
import { AppHeader } from "@/components/app-header"
import { AppointmentSheet } from "@/components/appointment-sheet"
import { BookingSheet } from "@/components/booking-sheet"
import { PatientSheet } from "@/components/patient-sheet"
import { DeskContext } from "@/components/desk-context"
import type { BookingDraft, Desk } from "@/components/desk-context"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { useNow } from "@/hooks/use-now"
import { validateDeskSearch } from "@/lib/desk-search"
import type { DeskSearch } from "@/lib/desk-search"

export const Route = createFileRoute("/_desk")({
  validateSearch: validateDeskSearch,
  component: DeskLayout,
  errorComponent: DeskError,
})

function DeskLayout() {
  const search = Route.useSearch()
  const [bookingDraft, setBookingDraft] = useState<BookingDraft | null>(null)
  const navigate = useNavigate()
  const now = useNow()
  const sites = useQuery(api.catalog.sites)

  if (sites === undefined) {
    return (
      <div className="grid h-dvh place-items-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }

  const site =
    sites.find((candidate) => candidate._id === search.site) ?? sites.at(0)
  if (!site) {
    return (
      <Empty className="h-dvh">
        <EmptyHeader>
          <EmptyTitle>Még nincs telephely</EmptyTitle>
          <EmptyDescription>
            Töltse fel a demó adatokat a <code>pnpm seed</code> paranccsal.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const update = (patch: Partial<DeskSearch>) =>
    navigate({ to: ".", search: (previous) => ({ ...previous, ...patch }) })

  const today = todayInClinic(now)
  const desk: Desk = {
    site,
    date: search.date ?? today,
    today,
    now,
    selectedAppointment: search.appointment ?? null,
    openAppointment: (appointmentId, on) =>
      update({
        appointment: appointmentId,
        book: undefined,
        at: undefined,
        move: undefined,
        patient: undefined,
        for: undefined,
        ...(on && {
          site: on.site,
          date: on.date === today ? undefined : on.date,
        }),
      }),
    openBooking: (resourceId, at, patientId) =>
      update({
        book: resourceId ?? "any",
        at,
        for: patientId,
        appointment: undefined,
        move: undefined,
        patient: undefined,
      }),
    openPatient: (target) =>
      update({
        patient: target,
        appointment: undefined,
        book: undefined,
        at: undefined,
        move: undefined,
        for: undefined,
      }),
    openMove: (appointmentId) =>
      update({
        move: appointmentId,
        appointment: undefined,
        book: undefined,
        at: undefined,
      }),
    bookingDraft,
    setBookingDraft,
  }

  return (
    <DeskContext value={desk}>
      <div className="flex h-dvh flex-col">
        <AppHeader sites={sites} />
        <main className="relative min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
      <BookingSheet
        request={
          search.move !== undefined
            ? { kind: "move", appointmentId: search.move }
            : search.book !== undefined
              ? {
                  kind: "new",
                  resource: search.book,
                  at: search.at,
                  patientId: search.for,
                }
              : null
        }
        // Closing a move returns to the appointment it started from.
        onClose={() =>
          update({
            book: undefined,
            at: undefined,
            for: undefined,
            move: undefined,
            appointment: search.move,
          })
        }
        onBooked={(date) =>
          update({
            book: undefined,
            at: undefined,
            for: undefined,
            date: date === today ? undefined : date,
          })
        }
        onMoved={(appointmentId, date) =>
          update({
            move: undefined,
            appointment: appointmentId,
            date: date === today ? undefined : date,
          })
        }
      />
      <AppointmentSheet
        appointmentId={search.appointment ?? null}
        onClose={() => update({ appointment: undefined })}
      />
      <PatientSheet
        target={search.patient ?? null}
        onClose={() => update({ patient: undefined })}
      />
    </DeskContext>
  )
}

function DeskError({ reset }: { reset: () => void }) {
  return (
    <Empty className="h-dvh">
      <EmptyHeader>
        <EmptyTitle>Nem sikerült betölteni a napot</EmptyTitle>
        <EmptyDescription>
          Ellenőrizze a hálózati kapcsolatot, majd töltse be újra.
        </EmptyDescription>
      </EmptyHeader>
      <Button onClick={reset}>Újratöltés</Button>
    </Empty>
  )
}
