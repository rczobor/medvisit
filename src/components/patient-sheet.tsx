import { useId, useState } from "react"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { PencilIcon, PlusIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { occupiesSlot } from "../../convex/lib/appointmentStatus"
import { formatTaj } from "../../convex/lib/taj"
import { instantToZoned, parseLocalDate } from "../../convex/lib/time"
import { useDesk } from "@/components/desk-context"
import { PatientForm } from "@/components/patient-form"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { usePatientSearch } from "@/hooks/use-patient-search"
import { formatDate, formatDay, formatTimeRange } from "@/lib/format"
import { useLastPresent } from "@/hooks/use-last-present"

type Card = NonNullable<FunctionReturnType<typeof api.patients.get>>
type Visit = Card["appointments"][number]

export function PatientSheet({
  target,
  onClose,
}: {
  /** A patient to show, "search" to find one, or null when closed. */
  target: Id<"patients"> | "search" | null
  onClose: () => void
}) {
  const shown = useLastPresent(target)

  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="gap-0 data-[side=right]:sm:max-w-md">
        {shown === "search" ? (
          <PatientFinder />
        ) : (
          shown && <PatientCard key={shown} patientId={shown} />
        )}
      </SheetContent>
    </Sheet>
  )
}

function PatientFinder() {
  const { openPatient } = useDesk()
  const [text, setText] = useState("")
  const searching = text.trim().length >= 2
  const results = usePatientSearch(searching ? { text } : "skip")

  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle className="text-lg font-semibold">
          Páciens keresése
        </SheetTitle>
        <SheetDescription>
          Név, TAJ-szám vagy telefonszám alapján.
        </SheetDescription>
        <div className="relative mt-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            aria-label="Páciens keresése"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Például: Kiss Anna"
            className="pl-8"
            autoComplete="off"
            autoFocus
          />
        </div>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
        {!searching ? (
          <p className="p-2 text-sm text-muted-foreground">
            Írjon be legalább két karaktert.
          </p>
        ) : results === undefined ? (
          <Spinner className="m-2 text-muted-foreground" />
        ) : results.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">
            Nincs ilyen páciens. Új pácienst foglaláskor vehet fel.
          </p>
        ) : (
          <ul className="flex flex-col">
            {results.map((patient) => (
              <li key={patient._id}>
                <button
                  type="button"
                  onClick={() => openPatient(patient._id)}
                  className="flex w-full flex-col rounded-md px-2 py-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="font-medium">
                    {patient.familyName} {patient.givenName}
                  </span>
                  <span className="flex flex-wrap gap-x-3 text-[13px] text-muted-foreground tabular">
                    <span>{formatDate(patient.birthDate)}</span>
                    {patient.taj && <span>TAJ: {formatTaj(patient.taj)}</span>}
                    {patient.phone && <span>{patient.phone}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

function PatientCard({ patientId }: { patientId: Id<"patients"> }) {
  const { today, now, openBooking } = useDesk()
  const card = useQuery(api.patients.get, { patientId })
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  if (card === undefined) {
    return (
      <div className="grid flex-1 place-items-center">
        <SheetTitle className="sr-only">Páciens</SheetTitle>
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    )
  }
  if (card === null) {
    return (
      <SheetHeader>
        <SheetTitle>Ez a páciens már nem létezik</SheetTitle>
        <SheetDescription>Zárja be ezt a panelt.</SheetDescription>
      </SheetHeader>
    )
  }

  const { patient, appointments } = card
  const currentYear = parseLocalDate(today).year
  // Still to come: booked or under way, oldest first.
  const upcoming = appointments
    .filter((visit) => visit.endAt > now && occupiesSlot(visit.status))
    .reverse()
  const past = appointments.filter((visit) => !upcoming.includes(visit))

  return (
    <>
      <SheetHeader className="gap-2 border-b pr-12">
        <SheetTitle className="text-lg font-semibold">
          {patient.familyName} {patient.givenName}
        </SheetTitle>
        <SheetDescription className="flex flex-wrap gap-x-4 tabular">
          <span>Szül.: {formatDate(patient.birthDate)}</span>
          {patient.taj && <span>TAJ: {formatTaj(patient.taj)}</span>}
        </SheetDescription>
        {!editing && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              onClick={() => openBooking(undefined, undefined, patientId)}
            >
              <PlusIcon />
              Új foglalás
            </Button>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon />
              Adatok szerkesztése
            </Button>
          </div>
        )}
      </SheetHeader>

      <div className="flex min-h-0 flex-1 scroll-py-6 flex-col gap-6 overflow-y-auto p-4">
        {editing ? (
          <PatientForm
            id="edit-patient-form"
            patient={patient}
            today={today}
            onSaved={() => {
              setEditing(false)
              toast.success("Adatok mentve")
            }}
            onSavingChange={setSaving}
          />
        ) : (
          <>
            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2.5 text-sm">
              <dt className="text-muted-foreground">Nem</dt>
              <dd>{patient.sex === "female" ? "Nő" : "Férfi"}</dd>
              <dt className="text-muted-foreground">Telefon</dt>
              <dd>
                {patient.phone ? (
                  <a
                    className="text-primary tabular hover:underline"
                    href={`tel:${patient.phone.replace(/\s/g, "")}`}
                  >
                    {patient.phone}
                  </a>
                ) : (
                  <Missing />
                )}
              </dd>
              <dt className="text-muted-foreground">E-mail</dt>
              <dd className="truncate">
                {patient.email ? (
                  <a
                    className="text-primary hover:underline"
                    href={`mailto:${patient.email}`}
                  >
                    {patient.email}
                  </a>
                ) : (
                  <Missing />
                )}
              </dd>
              <dt className="text-muted-foreground">Születési hely</dt>
              <dd>{patient.birthPlace ?? <Missing />}</dd>
              <dt className="text-muted-foreground">Anyja neve</dt>
              <dd>{patient.mothersName ?? <Missing />}</dd>
            </dl>
            <Visits
              title="Következő időpontok"
              empty="Nincs foglalt időpontja."
              visits={upcoming}
              currentYear={currentYear}
            />
            <Visits
              title="Korábbi időpontok"
              empty="Még nem járt nálunk."
              visits={past}
              currentYear={currentYear}
            />
          </>
        )}
      </div>

      {editing && (
        <SheetFooter className="border-t bg-card">
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Mégse
            </Button>
            <Button type="submit" form="edit-patient-form" disabled={saving}>
              {saving && <Spinner />}
              Adatok mentése
            </Button>
          </div>
        </SheetFooter>
      )}
    </>
  )
}

function Missing() {
  return <span className="text-muted-foreground">Nincs megadva</span>
}

function Visits({
  title,
  empty,
  visits,
  currentYear,
}: {
  title: string
  empty: string
  visits: Visit[]
  currentYear: number
}) {
  const { openAppointment } = useDesk()
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="text-sm font-medium">
        {title}
      </h3>
      {visits.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {visits.map((visit) => {
            const date = instantToZoned(visit.startAt).date
            return (
              <li key={visit._id}>
                <button
                  type="button"
                  onClick={() =>
                    openAppointment(visit._id, { site: visit.siteId, date })
                  }
                  className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium first-letter:uppercase">
                      {formatDay(date, currentYear)},{" "}
                      <span className="tabular">
                        {formatTimeRange(visit.startAt, visit.endAt)}
                      </span>
                    </span>
                    <span className="block truncate text-muted-foreground">
                      {visit.service ?? "Törölt vizsgálat"},{" "}
                      {visit.site ?? "Törölt telephely"},{" "}
                      {visit.resource ?? "Törölt naptár"}
                    </span>
                  </span>
                  <StatusBadge status={visit.status} className="shrink-0" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
