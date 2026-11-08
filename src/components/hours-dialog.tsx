import { useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { PlusIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import {
  MAX_SHIFTS_PER_DAY,
  dayRulesProblem,
} from "../../convex/lib/availability"
import type { DayRulesProblem } from "../../convex/lib/availability"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { errorMessage } from "@/lib/labels"

type Calendar = { _id: Id<"resources">; name: string }
type Shift = { key: number; start: string; end: string }
type Week = Record<number, Shift[]>

const weekdays = [
  "Hétfő",
  "Kedd",
  "Szerda",
  "Csütörtök",
  "Péntek",
  "Szombat",
  "Vasárnap",
]

const problemMessage: Record<DayRulesProblem, string> = {
  invalidTime: "Adja meg minden műszak kezdetét és végét.",
  endBeforeStart: "A műszak vége legyen a kezdete után.",
  overlap: "A műszakok nem fedhetik egymást.",
}

/** Edits a calendar's weekly hours, the times it is bookable every week. */
export function HoursDialog({
  calendar,
  onClose,
}: {
  /** The calendar to edit; null keeps the dialog closed. */
  calendar: Calendar | null
  onClose: () => void
}) {
  // Keep the last calendar while the dialog animates closed.
  const shown = useRef(calendar)
  if (calendar) shown.current = calendar

  return (
    <Dialog
      open={calendar !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {shown.current && (
          <HoursLoader
            key={shown.current._id}
            calendar={shown.current}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function HoursLoader({
  calendar,
  onDone,
}: {
  calendar: Calendar
  onDone: () => void
}) {
  const rules = useQuery(api.schedule.weeklyHours, {
    resourceId: calendar._id,
  })
  if (rules === undefined) {
    return (
      <div className="grid h-40 place-items-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }
  // Seeded once: a change saved elsewhere meanwhile doesn't reset the edit.
  const week: Week = {}
  rules.forEach((rule, key) => {
    week[rule.weekday] = [
      ...(week[rule.weekday] ?? []),
      { key, start: rule.start, end: rule.end },
    ]
  })
  return (
    <HoursForm
      calendar={calendar}
      initial={week}
      firstKey={rules.length}
      onDone={onDone}
    />
  )
}

function HoursForm({
  calendar,
  initial,
  firstKey,
  onDone,
}: {
  calendar: Calendar
  initial: Week
  firstKey: number
  onDone: () => void
}) {
  const setWeeklyHours = useMutation(api.schedule.setWeeklyHours)
  const [week, setWeek] = useState(initial)
  const nextKey = useRef(firstKey)
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const shiftsOf = (weekday: number) => week[weekday] ?? []
  const setDay = (weekday: number, shifts: Shift[]) =>
    setWeek((previous) => ({ ...previous, [weekday]: shifts }))

  function addShift(weekday: number) {
    const shifts = shiftsOf(weekday)
    const last = shifts.at(-1)
    // A new day starts with a common shift; a split day continues after the last.
    const shift = last
      ? { start: last.end, end: last.end < "20:00" ? "20:00" : "23:59" }
      : { start: "08:00", end: "16:00" }
    setDay(weekday, [...shifts, { key: nextKey.current++, ...shift }])
  }

  function updateShift(weekday: number, key: number, patch: Partial<Shift>) {
    setDay(
      weekday,
      shiftsOf(weekday).map((shift) =>
        shift.key === key ? { ...shift, ...patch } : shift
      )
    )
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return
    const found: Record<number, string> = {}
    for (let weekday = 1; weekday <= 7; weekday++) {
      const problem = dayRulesProblem(shiftsOf(weekday))
      if (problem) found[weekday] = problemMessage[problem]
    }
    setErrors(found)
    setFormError(null)
    if (Object.keys(found).length > 0) return
    setSaving(true)
    try {
      await setWeeklyHours({
        resourceId: calendar._id,
        rules: Object.entries(week).flatMap(([weekday, shifts]) =>
          shifts.map(({ start, end }) => ({
            weekday: Number(weekday),
            start,
            end,
          }))
        ),
      })
      toast.success("Rendelési idő mentve", { description: calendar.name })
      onDone()
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{calendar.name}: heti rendelési idő</DialogTitle>
        <DialogDescription>
          Mentés után minden héten ezekben az órákban lehet foglalni. A meglévő
          foglalások maradnak. Egy-egy napra a rendkívüli nyitás vagy a zárás
          való.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col divide-y">
        {weekdays.map((dayName, index) => {
          const weekday = index + 1
          const shifts = shiftsOf(weekday)
          return (
            <div
              key={weekday}
              role="group"
              aria-labelledby={`hours-day-${weekday}`}
              // Phones stack the day above its shifts; side by side they overflow.
              className="grid items-start gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0 sm:grid-cols-[5.5rem_1fr]"
            >
              <span
                id={`hours-day-${weekday}`}
                className="text-sm font-medium sm:pt-2"
              >
                {dayName}
              </span>
              <div className="flex flex-col gap-1.5">
                {shifts.length === 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Zárva</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground"
                      aria-label={`${dayName}: műszak hozzáadása`}
                      title="Műszak hozzáadása"
                      onClick={() => addShift(weekday)}
                    >
                      <PlusIcon />
                    </Button>
                  </div>
                )}
                {shifts.map((shift, position) => (
                  <div key={shift.key} className="flex items-center gap-1.5">
                    <Input
                      type="time"
                      step={300}
                      aria-label={`${dayName}, ${position + 1}. műszak kezdete`}
                      value={shift.start}
                      onChange={(event) =>
                        updateShift(weekday, shift.key, {
                          start: event.target.value,
                        })
                      }
                      className="min-w-0 flex-1 tabular sm:w-32 sm:flex-none"
                    />
                    <span aria-hidden className="text-muted-foreground">
                      –
                    </span>
                    <Input
                      type="time"
                      step={300}
                      aria-label={`${dayName}, ${position + 1}. műszak vége`}
                      value={shift.end}
                      onChange={(event) =>
                        updateShift(weekday, shift.key, {
                          end: event.target.value,
                        })
                      }
                      className="min-w-0 flex-1 tabular sm:w-32 sm:flex-none"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${dayName}, ${position + 1}. műszak törlése`}
                      title="Műszak törlése"
                      className="text-muted-foreground"
                      onClick={() =>
                        setDay(
                          weekday,
                          shifts.filter(
                            (candidate) => candidate.key !== shift.key
                          )
                        )
                      }
                    >
                      <XIcon />
                    </Button>
                    {/* From sm up, adding sits on the last shift's row so a
                        day stays one line; earlier rows keep its space for
                        alignment. Phones are too narrow and add below. */}
                    {shifts.length < MAX_SHIFTS_PER_DAY &&
                      (position === shifts.length - 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${dayName}: újabb műszak hozzáadása`}
                          title="Újabb műszak hozzáadása"
                          className="text-muted-foreground max-sm:hidden"
                          onClick={() => addShift(weekday)}
                        >
                          <PlusIcon />
                        </Button>
                      ) : (
                        <span
                          aria-hidden
                          className="size-7 shrink-0 max-sm:hidden"
                        />
                      ))}
                  </div>
                ))}
                {shifts.length > 0 && shifts.length < MAX_SHIFTS_PER_DAY && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="self-start text-muted-foreground sm:hidden"
                    aria-label={`${dayName}: újabb műszak hozzáadása`}
                    onClick={() => addShift(weekday)}
                  >
                    <PlusIcon />
                    Műszak hozzáadása
                  </Button>
                )}
                {errors[weekday] && <FieldError>{errors[weekday]}</FieldError>}
              </div>
            </div>
          )
        })}
      </div>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Mégse
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Spinner />}
          Rendelési idő mentése
        </Button>
      </DialogFooter>
    </form>
  )
}
