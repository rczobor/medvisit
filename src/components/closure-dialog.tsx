import { useState } from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { MAX_CLOSURE_DAYS } from "../../convex/lib/availability"
import {
  addDays,
  dayBounds,
  parseLocalDate,
  zonedTimeToInstant,
} from "../../convex/lib/time"
import type { LocalDate } from "../../convex/lib/time"
import { DatePicker } from "@/components/date-picker"
import { useDesk } from "@/components/desk-context"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { errorMessage } from "@/lib/labels"
import { useLastPresent } from "@/hooks/use-last-present"

type Calendar = { _id: Id<"resources">; name: string }

const reasons = ["Ünnepnap", "Karbantartás", "Szabadság", "Képzés"]
const wallTime = /^([01]\d|2[0-3]):[0-5]\d$/

/** Records a closure for one calendar, or for every calendar of the site. */
export function ClosureDialog({
  calendar,
  calendars,
  onClose,
}: {
  /** The calendar the closure starts from; null keeps the dialog closed. */
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
      {/* Scrolls on short screens, such as a phone held sideways. */}
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        {shown && (
          <ClosureForm
            key={shown._id}
            calendar={shown}
            calendars={calendars}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

type Errors = Partial<Record<"reason" | "days" | "times" | "form", string>>

function ClosureForm({
  calendar,
  calendars,
  onDone,
}: {
  calendar: Calendar
  calendars: Calendar[]
  onDone: () => void
}) {
  const { site, date, today, now } = useDesk()
  const addClosure = useMutation(api.schedule.addClosure)
  const [everyCalendar, setEveryCalendar] = useState(false)
  const [fromDate, setFromDate] = useState<LocalDate>(date)
  const [toDate, setToDate] = useState<LocalDate>(date)
  const [allDay, setAllDay] = useState(true)
  const [fromTime, setFromTime] = useState("08:00")
  const [toTime, setToTime] = useState("12:00")
  const [reason, setReason] = useState("")
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const currentYear = parseLocalDate(today).year

  function validate() {
    const found: Errors = {}
    if (!reason.trim()) found.reason = "Adja meg a zárás okát."
    if (toDate < fromDate) {
      found.days = "Az utolsó nap nem lehet a kezdő nap előtt."
    } else if (toDate > addDays(fromDate, MAX_CLOSURE_DAYS - 1)) {
      found.days = `Egyszerre legfeljebb ${MAX_CLOSURE_DAYS} napot zárhat le.`
    }
    if (!allDay && (!wallTime.test(fromTime) || !wallTime.test(toTime))) {
      found.times = "Adja meg a kezdés és a befejezés idejét."
    }
    if (Object.keys(found).length > 0) return { found }

    const startAt = zonedTimeToInstant(fromDate, allDay ? "00:00" : fromTime)
    const endAt = allDay
      ? dayBounds(toDate).end
      : zonedTimeToInstant(toDate, toTime)
    if (endAt <= startAt) {
      found.times = "A zárás vége legyen a kezdete után."
    } else if (endAt <= now) {
      found.days = "Elmúlt időszakot nem lehet lezárni."
    }
    return { found, startAt, endAt }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return
    const { found, startAt, endAt } = validate()
    setErrors(found)
    if (Object.keys(found).length > 0 || startAt === undefined) return
    setSaving(true)
    try {
      const { affected } = await addClosure({
        resourceIds: everyCalendar
          ? calendars.map((candidate) => candidate._id)
          : [calendar._id],
        startAt,
        endAt,
        reason: reason.trim(),
      })
      toast.success("Zárás rögzítve", {
        description:
          affected > 0
            ? `${affected} foglalás esik erre az időre. Helyezze át vagy mondja le őket.`
            : undefined,
      })
      onDone()
    } catch (error) {
      setErrors({ form: errorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Zárás rögzítése</DialogTitle>
        <DialogDescription>
          {everyCalendar ? `${site.name}, minden naptár` : calendar.name}: erre
          az időre nem lehet foglalni. A meglévő foglalások maradnak.
        </DialogDescription>
      </DialogHeader>

      <Label className="font-normal">
        <Checkbox
          checked={everyCalendar}
          onCheckedChange={(checked) => setEveryCalendar(checked)}
        />
        A telephely összes naptára ({calendars.length})
      </Label>

      {/* Long day names don't fit side by side at phone width. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="closure-from">Kezdő nap</FieldLabel>
          <DatePicker
            id="closure-from"
            value={fromDate}
            currentYear={currentYear}
            onChange={(picked) => {
              setFromDate(picked)
              if (toDate < picked) setToDate(picked)
            }}
            className="w-full justify-start border border-input"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="closure-to">Utolsó nap</FieldLabel>
          <DatePicker
            id="closure-to"
            value={toDate}
            currentYear={currentYear}
            onChange={setToDate}
            className="w-full justify-start border border-input"
          />
        </Field>
        {errors.days && (
          <FieldError className="sm:col-span-2">{errors.days}</FieldError>
        )}
      </div>

      <Label className="font-normal">
        <Checkbox
          checked={allDay}
          onCheckedChange={(checked) => setAllDay(checked)}
        />
        Egész nap
      </Label>
      {!allDay && (
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="closure-from-time">Kezdés</FieldLabel>
            <Input
              id="closure-from-time"
              type="time"
              step={300}
              value={fromTime}
              onChange={(event) => setFromTime(event.target.value)}
              className="tabular"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="closure-to-time">Befejezés</FieldLabel>
            <Input
              id="closure-to-time"
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
      )}

      <Field>
        <FieldLabel htmlFor="closure-reason">A zárás oka</FieldLabel>
        <Input
          id="closure-reason"
          value={reason}
          maxLength={80}
          aria-invalid={errors.reason ? true : undefined}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Például: karbantartás"
          autoComplete="off"
        />
        <div className="flex flex-wrap gap-1.5">
          {reasons.map((suggestion) => (
            <Button
              key={suggestion}
              type="button"
              variant="outline"
              size="xs"
              aria-pressed={reason === suggestion}
              onClick={() => setReason(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
        {errors.reason && <FieldError>{errors.reason}</FieldError>}
      </Field>

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
          Zárás mentése
        </Button>
      </DialogFooter>
    </form>
  )
}
