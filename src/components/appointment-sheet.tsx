import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { CalendarClockIcon, DropletIcon } from "lucide-react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import {
  isAppointmentStatus,
  nextStatuses,
} from "../../convex/lib/appointmentStatus"
import type { AppointmentStatus } from "../../convex/lib/appointmentStatus"
import { formatTaj } from "../../convex/lib/taj"
import {
  MINUTE_MS,
  instantToZoned,
  parseLocalDate,
} from "../../convex/lib/time"
import { useDesk } from "@/components/desk-context"
import { StatusBadge } from "@/components/status-badge"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  formatDate,
  formatDay,
  formatHuf,
  formatTime,
  formatTimeRange,
} from "@/lib/format"
import {
  errorMessage,
  historyLabel,
  sourceLabel,
  transitionLabel,
} from "@/lib/labels"
import { useLastPresent } from "@/hooks/use-last-present"

export function AppointmentSheet({
  appointmentId,
  onClose,
}: {
  appointmentId: Id<"appointments"> | null
  onClose: () => void
}) {
  const shown = useLastPresent(appointmentId)

  return (
    <Sheet
      open={appointmentId !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <SheetContent className="gap-0 data-[side=right]:sm:max-w-md">
        {shown && <AppointmentDetails appointmentId={shown} />}
      </SheetContent>
    </Sheet>
  )
}

function AppointmentDetails({
  appointmentId,
}: {
  appointmentId: Id<"appointments">
}) {
  const { today, now, openMove, openPatient } = useDesk()
  const appointment = useQuery(api.schedule.appointment, { appointmentId })
  const setStatus = useMutation(api.schedule.setStatus)
  const [pending, setPending] = useState<AppointmentStatus | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)

  if (appointment === undefined) {
    return (
      <div className="grid flex-1 place-items-center">
        <SheetTitle className="sr-only">Foglalás</SheetTitle>
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    )
  }
  if (appointment === null) {
    return (
      <SheetHeader>
        <SheetTitle>Ez a foglalás már nem létezik</SheetTitle>
        <SheetDescription>
          Lehet, hogy közben törölték. Zárja be ezt a panelt.
        </SheetDescription>
      </SheetHeader>
    )
  }

  const { patient, service, resource, status } = appointment
  const currentYear = parseLocalDate(today).year
  const appointmentDay = instantToZoned(appointment.startAt).date
  const isFutureDay = appointmentDay > today
  // Mirrors the backend: visit outcomes need the day to have come, and a
  // no-show needs the start time to have passed.
  const actions = nextStatuses(status).filter(
    (to) =>
      !(
        isFutureDay &&
        (to === "arrived" || to === "completed" || to === "noShow")
      ) && !(to === "noShow" && appointment.startAt > now)
  )
  const forward = actions.find((to) => to === "arrived" || to === "completed")
  const movable = status === "booked"
  const noShowLater =
    !isFutureDay &&
    nextStatuses(status).includes("noShow") &&
    appointment.startAt > now

  async function change(to: AppointmentStatus, cancelReason?: string) {
    setPending(to)
    try {
      await setStatus({ appointmentId, status: to, cancelReason })
      toast.success(historyLabel[to])
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(null)
    }
  }

  return (
    <>
      <SheetHeader className="gap-2 border-b pr-12">
        <SheetTitle className="text-lg font-semibold">
          {patient
            ? `${patient.familyName} ${patient.givenName}`
            : "Ismeretlen páciens"}
        </SheetTitle>
        <SheetDescription className="flex flex-wrap items-baseline gap-x-4 tabular">
          {patient && <span>Szül.: {formatDate(patient.birthDate)}</span>}
          {patient?.taj && <span>TAJ: {formatTaj(patient.taj)}</span>}
          {patient && (
            <button
              type="button"
              className="rounded-sm text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => openPatient(patient._id)}
            >
              Páciens adatlapja
            </button>
          )}
        </SheetDescription>
        <StatusBadge status={status} className="font-medium" />
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2.5 text-sm">
          <dt className="text-muted-foreground">Időpont</dt>
          <dd>
            <span className="block first-letter:uppercase">
              {formatDay(appointmentDay, currentYear)}
            </span>
            <span className="block font-semibold tabular">
              {formatTimeRange(appointment.startAt, appointment.endAt)}
              <span className="font-normal text-muted-foreground">
                {" "}
                ({(appointment.endAt - appointment.startAt) / MINUTE_MS} perc)
              </span>
            </span>
          </dd>
          <dt className="text-muted-foreground">Vizsgálat</dt>
          <dd>
            {service?.name ?? "Törölt vizsgálat"}
            {service?.contrast && (
              <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <DropletIcon className="size-3.5" aria-hidden />
                Kontrasztanyaggal
              </span>
            )}
          </dd>
          <dt className="text-muted-foreground">Naptár</dt>
          <dd>{resource?.name ?? "Törölt naptár"}</dd>
          <dt className="text-muted-foreground">Ár</dt>
          <dd className="tabular">{formatHuf(appointment.priceHuf)}</dd>
          <dt className="text-muted-foreground">Forrás</dt>
          <dd>{sourceLabel[appointment.source]}</dd>
          {patient?.phone && (
            <>
              <dt className="text-muted-foreground">Telefon</dt>
              <dd>
                <a
                  className="text-primary tabular hover:underline"
                  href={`tel:${patient.phone.replace(/\s/g, "")}`}
                >
                  {patient.phone}
                </a>
              </dd>
            </>
          )}
          {patient?.email && (
            <>
              <dt className="text-muted-foreground">E-mail</dt>
              <dd className="truncate">
                <a
                  className="text-primary hover:underline"
                  href={`mailto:${patient.email}`}
                >
                  {patient.email}
                </a>
              </dd>
            </>
          )}
          {appointment.note && (
            <>
              <dt className="text-muted-foreground">Megjegyzés</dt>
              <dd className="whitespace-pre-wrap">{appointment.note}</dd>
            </>
          )}
          {appointment.cancelReason && (
            <>
              <dt className="text-muted-foreground">Lemondás oka</dt>
              <dd className="whitespace-pre-wrap">
                {appointment.cancelReason}
              </dd>
            </>
          )}
        </dl>

        {appointment.history.length > 0 && (
          <section
            aria-labelledby="appointment-history"
            className="flex flex-col gap-2"
          >
            <h3 id="appointment-history" className="text-sm font-medium">
              Előzmények
            </h3>
            <ol className="flex flex-col gap-1.5 text-sm">
              {appointment.history.map((event) => {
                const to = event.details?.to
                const from = event.details?.fromStartAt
                const label =
                  event.action === "appointment.booked"
                    ? "Foglalás rögzítve"
                    : event.action === "appointment.moved"
                      ? typeof from === "number"
                        ? `Áthelyezve, korábban ${formatDate(instantToZoned(from).date)} ${formatTime(from)}`
                        : "Áthelyezve"
                      : isAppointmentStatus(to)
                        ? historyLabel[to]
                        : event.action
                return (
                  <li key={event._id} className="flex justify-between gap-3">
                    <span>{label}</span>
                    <span className="shrink-0 text-muted-foreground tabular">
                      {event.actor}, {formatDate(instantToZoned(event.at).date)}{" "}
                      {formatTime(event.at)}
                    </span>
                  </li>
                )
              })}
            </ol>
          </section>
        )}
      </div>

      {(actions.length > 0 || movable) && (
        <div className="flex flex-wrap gap-2 border-t bg-card p-4">
          {forward && (
            <Button
              size="lg"
              className="flex-1"
              disabled={pending !== null}
              onClick={() => change(forward)}
            >
              {pending === forward && <Spinner />}
              {transitionLabel(status, forward)}
            </Button>
          )}
          {movable && (
            <Button
              size="lg"
              variant="outline"
              disabled={pending !== null}
              onClick={() => openMove(appointmentId)}
            >
              <CalendarClockIcon />
              Áthelyezés
            </Button>
          )}
          {actions
            .filter((to) => to !== forward)
            .map((to) => (
              <Button
                key={to}
                size="lg"
                variant={to === "cancelled" ? "destructive" : "outline"}
                disabled={pending !== null}
                onClick={() =>
                  to === "cancelled" ? setCancelOpen(true) : change(to)
                }
              >
                {pending === to && <Spinner />}
                {transitionLabel(status, to)}
              </Button>
            ))}
          {noShowLater && (
            <p className="w-full text-xs text-muted-foreground">
              Nem jelent meg: {formatTime(appointment.startAt)} után rögzíthető.
            </p>
          )}
        </div>
      )}

      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onConfirm={(reason) => {
          setCancelOpen(false)
          void change("cancelled", reason)
        }}
      />
    </>
  )
}

function CancelDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState("")
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Lemondja a foglalást?</AlertDialogTitle>
          <AlertDialogDescription>
            Az időpont azonnal újra foglalható lesz. A lemondást nem lehet
            visszavonni.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor="cancel-reason">Lemondás oka</FieldLabel>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Például: a páciens kérésére"
            rows={2}
          />
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel>Mégse</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={() => onConfirm(reason.trim())}
          >
            Foglalás lemondása
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
