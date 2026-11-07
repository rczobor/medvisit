import { useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { cn } from "cn"
import { DropletIcon, UserPlusIcon } from "lucide-react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import {
  MINUTE_MS,
  instantToZoned,
  parseLocalDate,
  zonedTimeToInstant,
} from "../../convex/lib/time"
import type { LocalDate } from "../../convex/lib/time"
import { foldForSearch } from "../../convex/lib/search"
import { formatTaj } from "../../convex/lib/taj"
import { DatePicker } from "@/components/date-picker"
import { useDesk } from "@/components/desk-context"
import { PatientForm } from "@/components/patient-form"
import type { PatientSummary } from "@/components/patient-form"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useStableQuery } from "@/hooks/use-stable-query"
import {
  formatDate,
  formatDay,
  formatHuf,
  formatTime,
  formatTimeRange,
} from "@/lib/format"
import { errorCode, errorMessage } from "@/lib/labels"

export type BookingRequest = { resource: Id<"resources"> | "any"; at?: string }

export function BookingSheet({
  request,
  onClose,
  onBooked,
}: {
  request: BookingRequest | null
  onClose: () => void
  onBooked: (date: LocalDate) => void
}) {
  // Keep the last request while the sheet animates closed.
  const shown = useRef(request)
  if (request) shown.current = request

  return (
    <Sheet open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 data-[side=right]:sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="text-lg font-semibold">Új foglalás</SheetTitle>
          <SheetDescription>
            Válasszon vizsgálatot, időpontot és pácienst.
          </SheetDescription>
        </SheetHeader>
        {shown.current && (
          <BookingForm request={shown.current} onBooked={onBooked} />
        )}
      </SheetContent>
    </Sheet>
  )
}

type Service = {
  _id: Id<"services">
  name: string
  contrast: boolean
  priceHuf: number
  durationMinutes: number
}

function BookingForm({
  request,
  onBooked,
}: {
  request: BookingRequest
  onBooked: (date: LocalDate) => void
}) {
  const desk = useDesk()
  const [date, setDate] = useState(desk.date)
  const [resourceChoice, setResourceChoice] = useState(
    request.resource === "any" ? null : request.resource
  )
  const [service, setService] = useState<Service | null>(null)
  const [pickedStart, setPickedStart] = useState<number | null>(null)
  const [patient, setPatient] = useState<PatientSummary | null>(null)
  const [creatingPatient, setCreatingPatient] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const book = useMutation(api.schedule.book)

  const day = useQuery(api.schedule.day, { siteId: desk.site._id, date })
  const resources = day?.resources ?? []
  const resource =
    resources.find((candidate) => candidate._id === resourceChoice) ??
    resources.at(0) ??
    null
  const services = useQuery(
    api.catalog.servicesForResource,
    resource ? { resourceId: resource._id } : "skip"
  )
  const selectedService =
    services?.find((candidate) => candidate._id === service?._id) ?? null
  const slots = useQuery(
    api.schedule.slots,
    resource && selectedService
      ? { resourceId: resource._id, serviceId: selectedService._id, date }
      : "skip"
  )
  const starts = (slots?.starts ?? []).filter((start) => start >= desk.now)

  // A start chosen on the board stays selected while it fits; otherwise the
  // first free time from there on is suggested.
  const hint =
    request.at && date === desk.date && resource?._id === request.resource
      ? zonedTimeToInstant(date, request.at)
      : null
  const start =
    pickedStart !== null && starts.includes(pickedStart)
      ? pickedStart
      : hint !== null
        ? (starts.find((candidate) => candidate >= hint) ?? null)
        : null
  const end =
    start !== null && slots ? start + slots.durationMinutes * MINUTE_MS : null

  const ready =
    resource && selectedService && start !== null && end !== null && patient
  const currentYear = parseLocalDate(desk.today).year

  async function submit() {
    if (!resource || !selectedService || start === null || !patient) return
    setSaving(true)
    setError(null)
    try {
      await book({
        resourceId: resource._id,
        serviceId: selectedService._id,
        patientId: patient._id,
        startAt: start,
        note: note.trim() || undefined,
      })
      toast.success("Foglalás rögzítve", {
        description: `${patient.familyName} ${patient.givenName}, ${formatDay(date, currentYear)} ${formatTime(start)}`,
      })
      onBooked(date)
    } catch (caught) {
      setError(errorMessage(caught))
      if (errorCode(caught) === "SLOT_TAKEN") setPickedStart(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="booking-resource">Naptár</FieldLabel>
            <Select
              items={resources.map((candidate) => ({
                value: candidate._id,
                label: candidate.name,
              }))}
              value={resource?._id ?? null}
              onValueChange={(value) => {
                setResourceChoice(value)
                setService(null)
              }}
            >
              <SelectTrigger id="booking-resource" className="w-full">
                <SelectValue placeholder="Válasszon" />
              </SelectTrigger>
              <SelectContent>
                {resources.map((candidate) => (
                  <SelectItem key={candidate._id} value={candidate._id}>
                    {candidate.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="booking-date">Nap</FieldLabel>
            <DatePicker
              id="booking-date"
              value={date}
              currentYear={currentYear}
              onChange={setDate}
              className="w-full justify-start border border-input"
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="booking-service">Vizsgálat</FieldLabel>
          <Combobox
            items={services ?? []}
            value={selectedService}
            onValueChange={(value) => setService(value)}
            itemToStringLabel={(item) => item.name}
            isItemEqualToValue={(item, value) => item._id === value._id}
            filter={(item, query) =>
              foldForSearch(item.name).includes(foldForSearch(query))
            }
          >
            <ComboboxInput
              id="booking-service"
              placeholder="Kezdje el gépelni, pl. térd"
              className="w-full"
            />
            <ComboboxContent>
              <ComboboxEmpty>
                Nincs ilyen vizsgálat ezen a naptáron.
              </ComboboxEmpty>
              <ComboboxList>
                {(item: Service) => (
                  <ComboboxItem key={item._id} value={item}>
                    <span className="flex-1 truncate">{item.name}</span>
                    {item.contrast && (
                      <DropletIcon
                        className="text-muted-foreground"
                        aria-label="Kontrasztanyagos"
                      />
                    )}
                    <span className="text-xs text-muted-foreground tabular">
                      {item.durationMinutes} perc
                    </span>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          {selectedService && (
            <p className="text-xs text-muted-foreground">
              {selectedService.durationMinutes} perc,{" "}
              {formatHuf(selectedService.priceHuf)}
              {selectedService.contrast && ", kontrasztanyaggal"}
            </p>
          )}
        </Field>

        <section
          aria-labelledby="booking-slots"
          className="flex flex-col gap-2"
        >
          <h3 id="booking-slots" className="text-sm font-medium">
            Szabad időpontok
          </h3>
          <SlotPicker
            hasService={selectedService !== null}
            loading={selectedService !== null && slots === undefined}
            starts={starts}
            selected={start}
            onSelect={setPickedStart}
          />
        </section>

        <section
          aria-labelledby="booking-patient"
          className="flex flex-col gap-2"
        >
          <h3 id="booking-patient" className="text-sm font-medium">
            Páciens
          </h3>
          {patient ? (
            <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {patient.familyName} {patient.givenName}
                </p>
                <p className="text-xs text-muted-foreground tabular">
                  Szül.: {formatDate(patient.birthDate)}
                  {patient.taj && `, TAJ: ${formatTaj(patient.taj)}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPatient(null)}
              >
                Másik páciens
              </Button>
            </div>
          ) : creatingPatient !== null ? (
            <PatientForm
              initialText={creatingPatient}
              today={desk.today}
              onCreated={(created) => {
                setPatient(created)
                setCreatingPatient(null)
              }}
              onCancel={() => setCreatingPatient(null)}
            />
          ) : (
            <PatientSearch
              onSelect={setPatient}
              onCreate={setCreatingPatient}
            />
          )}
        </section>

        <Field>
          <FieldLabel htmlFor="booking-note">Megjegyzés</FieldLabel>
          <Textarea
            id="booking-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Például: beutalót hoz, klausztrofóbiás"
            rows={2}
          />
        </Field>
      </div>

      <SheetFooter className="gap-3 border-t bg-card">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-sm">
            {ready ? (
              <>
                <span className="block font-medium first-letter:uppercase">
                  {formatDay(instantToZoned(start).date, currentYear)},{" "}
                  {formatTimeRange(start, end)}
                </span>
                <span className="block truncate text-muted-foreground">
                  {resource.name}, {selectedService.name}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                {!selectedService
                  ? "Válasszon vizsgálatot."
                  : start === null
                    ? "Válasszon időpontot."
                    : "Válasszon pácienst."}
              </span>
            )}
          </p>
          <Button size="lg" disabled={!ready || saving} onClick={submit}>
            {saving && <Spinner />}
            Foglalás rögzítése
          </Button>
        </div>
      </SheetFooter>
    </>
  )
}

const dayParts = [
  { label: "Délelőtt", until: 12 * 60 },
  { label: "Délután", until: 17 * 60 },
  { label: "Este", until: 24 * 60 },
]

function SlotPicker({
  hasService,
  loading,
  starts,
  selected,
  onSelect,
}: {
  hasService: boolean
  loading: boolean
  starts: number[]
  selected: number | null
  onSelect: (start: number) => void
}) {
  if (!hasService) {
    return (
      <p className="text-sm text-muted-foreground">
        A szabad időpontok a vizsgálat kiválasztása után jelennek meg.
      </p>
    )
  }
  if (loading) return <Spinner className="text-muted-foreground" />
  if (starts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ezen a napon nincs szabad időpont. Válasszon másik napot vagy naptárt.
      </p>
    )
  }

  let from = 0
  const groups = dayParts.map((part) => {
    const group = {
      label: part.label,
      starts: starts.filter((start) => {
        const minutes = instantToZoned(start).minutes
        return minutes >= from && minutes < part.until
      }),
    }
    from = part.until
    return group
  })

  return (
    <div className="flex flex-col gap-3">
      {groups
        .filter((group) => group.starts.length > 0)
        .map((group) => (
          <div key={group.label} className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{group.label}</span>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-1.5">
              {group.starts.map((start) => (
                <Button
                  key={start}
                  size="sm"
                  variant={start === selected ? "default" : "outline"}
                  aria-pressed={start === selected}
                  className={cn("tabular", start === selected && "shadow-sm")}
                  onClick={() => onSelect(start)}
                >
                  {formatTime(start)}
                </Button>
              ))}
            </div>
          </div>
        ))}
    </div>
  )
}

function PatientSearch({
  onSelect,
  onCreate,
}: {
  onSelect: (patient: PatientSummary) => void
  onCreate: (text: string) => void
}) {
  const [text, setText] = useState("")
  const results =
    useStableQuery(
      api.patients.search,
      text.trim().length >= 2 ? { text } : "skip"
    ) ?? []

  return (
    <div className="flex gap-2">
      <Combobox<PatientSummary>
        items={results}
        filter={null}
        value={null}
        onValueChange={(value) => value && onSelect(value)}
        onInputValueChange={setText}
        itemToStringLabel={(item) => `${item.familyName} ${item.givenName}`}
        isItemEqualToValue={(item, value) => item._id === value._id}
      >
        <ComboboxInput
          aria-label="Páciens keresése"
          placeholder="Név, TAJ-szám vagy telefonszám"
          showTrigger={false}
          className="min-w-0 flex-1"
        />
        <ComboboxContent>
          <ComboboxEmpty>
            {text.trim().length < 2
              ? "Írjon be legalább két karaktert."
              : "Nincs ilyen páciens. Vegye fel újként."}
          </ComboboxEmpty>
          <ComboboxList>
            {(item: PatientSummary) => (
              <ComboboxItem key={item._id} value={item}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {item.familyName} {item.givenName}
                  </span>
                  <span className="block text-xs text-muted-foreground tabular">
                    {formatDate(item.birthDate)}
                    {item.taj && `, TAJ: ${formatTaj(item.taj)}`}
                  </span>
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <Button variant="outline" onClick={() => onCreate(text)}>
        <UserPlusIcon />
        Új páciens
      </Button>
    </div>
  )
}
