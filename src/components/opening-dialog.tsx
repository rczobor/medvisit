import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useMutation } from "convex/react"
import { InfoIcon } from "lucide-react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import {
  isWallTime,
  parseLocalDate,
  zonedTimeToInstant,
} from "../../convex/lib/time"
import type { LocalDate } from "../../convex/lib/time"
import { DatePicker } from "@/components/date-picker"
import { useDesk } from "@/components/desk-context"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { formatDay } from "@/lib/format"
import { errorMessage } from "@/lib/labels"
import { useLastPresent } from "@/hooks/use-last-present"

type Calendar = { _id: Id<"resources">; name: string }

/**
 * Opens a calendar for extra hours on one day, such as a Sunday MR session.
 * Starts on `calendar`; the select can switch to another of the site's.
 */
export function OpeningDialog({
  calendar,
  calendars,
  onClose,
}: {
  /** null keeps the dialog closed. */
  calendar: Calendar | null
  calendars: Calendar[]
  onClose: () => void
}) {
  const shown = useLastPresent(calendar)

  return (
    <Dialog
      open={calendar !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        {shown && (
          <OpeningForm
            key={shown._id}
            initial={shown._id}
            calendars={calendars}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

type Errors = Partial<Record<"calendar" | "times" | "form", string>>

function OpeningForm({
  initial,
  calendars,
  onDone,
}: {
  initial: Id<"resources">
  calendars: Calendar[]
  onDone: () => void
}) {
  const { date, today, now } = useDesk()
  const navigate = useNavigate()
  const addOpening = useMutation(api.schedule.addOpening)
  const [calendarId, setCalendarId] = useState(initial)
  const [day, setDay] = useState<LocalDate>(date)
  const [fromTime, setFromTime] = useState("08:00")
  const [toTime, setToTime] = useState("14:00")
  const [note, setNote] = useState("")
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const currentYear = parseLocalDate(today).year
  const calendar = calendars.find((candidate) => candidate._id === calendarId)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return
    const found: Errors = {}
    if (!calendar) found.calendar = "Válassza ki a naptárat."
    let startAt = 0
    let endAt = 0
    if (!isWallTime(fromTime) || !isWallTime(toTime)) {
      found.times = "Adja meg a kezdés és a befejezés idejét."
    } else {
      startAt = zonedTimeToInstant(day, fromTime)
      endAt = zonedTimeToInstant(day, toTime)
      if (endAt <= startAt) found.times = "A vége legyen a kezdete után."
      else if (endAt <= now) found.times = "Elmúlt időre nem lehet nyitni."
    }
    setErrors(found)
    if (Object.keys(found).length > 0 || !calendar) return
    setSaving(true)
    const openingNote = note.trim() || undefined
    try {
      await addOpening({
        resourceId: calendar._id,
        startAt,
        endAt,
        note: openingNote,
      })
      toast.success("Rendelés megnyitva", {
        description: `${calendar.name}, ${formatDay(day, currentYear)}, ${fromTime}–${toTime}`,
      })
      // Show the day that was opened.
      if (day !== date) {
        void navigate({
          to: ".",
          search: (previous) => ({
            ...previous,
            date: day === today ? undefined : day,
          }),
        })
      }
      onDone()
    } catch (error) {
      setErrors({ form: errorMessage(error) })
    }
    setSaving(false)
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Rendkívüli nyitás</DialogTitle>
        <DialogDescription>
          Erre az időre a naptár a heti rendelési időn felül is foglalható.
        </DialogDescription>
      </DialogHeader>

      <Field>
        <FieldLabel htmlFor="opening-calendar">Naptár</FieldLabel>
        <Select
          items={calendars.map((candidate) => ({
            value: candidate._id,
            label: candidate.name,
          }))}
          value={calendarId}
          onValueChange={(value) => value && setCalendarId(value)}
        >
          <SelectTrigger
            id="opening-calendar"
            className="w-full"
            aria-invalid={errors.calendar ? true : undefined}
          >
            <SelectValue placeholder="Válasszon naptárat" />
          </SelectTrigger>
          <SelectContent>
            {calendars.map((candidate) => (
              <SelectItem key={candidate._id} value={candidate._id}>
                {candidate.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.calendar && <FieldError>{errors.calendar}</FieldError>}
      </Field>

      <Field>
        <FieldLabel htmlFor="opening-day">Nap</FieldLabel>
        <DatePicker
          id="opening-day"
          value={day}
          currentYear={currentYear}
          onChange={setDay}
          className="w-full justify-start border border-input"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="opening-from">Kezdés</FieldLabel>
          <Input
            id="opening-from"
            type="time"
            step={300}
            value={fromTime}
            onChange={(event) => setFromTime(event.target.value)}
            className="tabular"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="opening-to">Befejezés</FieldLabel>
          <Input
            id="opening-to"
            type="time"
            step={300}
            value={toTime}
            onChange={(event) => setToTime(event.target.value)}
            className="tabular"
          />
        </Field>
        {errors.times && (
          <FieldError className="col-span-2">{errors.times}</FieldError>
        )}
      </div>

      <Field>
        <FieldLabel htmlFor="opening-note">
          Megjegyzés (nem kötelező)
        </FieldLabel>
        <Input
          id="opening-note"
          value={note}
          maxLength={80}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Például: MR pótnap a várólista miatt"
          autoComplete="off"
        />
      </Field>

      {calendar &&
        isWallTime(fromTime) &&
        isWallTime(toTime) &&
        fromTime < toTime && (
          <p className="flex gap-1.5 text-sm text-muted-foreground">
            <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Mentés után {calendar.name} {formatDay(day, currentYear)}{" "}
              <span className="tabular">
                {fromTime}–{toTime}
              </span>{" "}
              között foglalható.
            </span>
          </p>
        )}
      {errors.form && (
        <p role="alert" className="text-sm text-destructive">
          {errors.form}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Mégse
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Spinner />}
          Nyitás mentése
        </Button>
      </DialogFooter>
    </form>
  )
}
