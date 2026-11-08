import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { cn } from "cn"
import {
  CalendarClockIcon,
  CalendarOffIcon,
  CalendarPlusIcon,
  DropletIcon,
  EllipsisVerticalIcon,
  GlobeIcon,
  HandshakeIcon,
  LockIcon,
  MessageSquareTextIcon,
  PlusIcon,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import {
  mergeIntervals,
  subtractIntervals,
} from "../../convex/lib/availability"
import type { Interval } from "../../convex/lib/availability"
import { occupiesSlot } from "../../convex/lib/appointmentStatus"
import {
  MINUTE_MS,
  instantToZoned,
  parseLocalDate,
  zonedTimeToInstant,
} from "../../convex/lib/time"
import { ClosureDialog } from "@/components/closure-dialog"
import { useDesk } from "@/components/desk-context"
import { HoursDialog } from "@/components/hours-dialog"
import { OpeningDialog } from "@/components/opening-dialog"
import { statusIcon } from "@/components/status-badge"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { formatDay, formatTime, formatTimeRange } from "@/lib/format"
import { errorMessage, sourceLabel, statusLabel } from "@/lib/labels"

type Day = FunctionReturnType<typeof api.schedule.day>
type Resource = Day["resources"][number]
type Appointment = Day["appointments"][number]
type Closure = Resource["closures"][number]
type Opening = Resource["openings"][number]

const PX_PER_MINUTE = 2
const SNAP_MINUTES = 5

const minutesOf = (instant: number) => instantToZoned(instant).minutes
const totalMinutes = (intervals: Interval[]) =>
  intervals.reduce((sum, { start, end }) => sum + (end - start) / MINUTE_MS, 0)
const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`

/**
 * The hours shown: every resource's weekly hours, widened to whole hours.
 * Weekly hours rather than working time, so a closed calendar still shows
 * its closure.
 */
function visibleRange(day: Day) {
  const shifts = day.resources.flatMap((resource) => resource.hours)
  if (shifts.length === 0) return null
  const start = Math.min(...shifts.map((shift) => minutesOf(shift.start)))
  const end = Math.max(
    ...shifts.map((shift) => minutesOf(shift.end) || 24 * 60)
  )
  return { start: Math.floor(start / 60) * 60, end: Math.ceil(end / 60) * 60 }
}

export function DayBoard() {
  const { site, date, today, now } = useDesk()
  const day = useQuery(api.schedule.day, { siteId: site._id, date })
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrolledFor = useRef<string | null>(null)
  const isAdmin = useQuery(api.catalog.viewer)?.isAdmin ?? false
  const [closing, setClosing] = useState<Resource | null>(null)
  const [opening, setOpening] = useState<Resource | null>(null)
  const [editingHours, setEditingHours] = useState<Resource | null>(null)
  const range = day ? visibleRange(day) : null
  const isToday = date === today

  // Open each day at the current time, or at the start of the day's work.
  useLayoutEffect(() => {
    const key = `${site._id}/${date}`
    if (!range || !scrollRef.current || scrolledFor.current === key) return
    scrolledFor.current = key
    let target = isToday ? minutesOf(now) - 60 : range.start
    // Start at the top of any block the edge would cut through, so its time
    // and patient name stay visible.
    // Moving up can cut another column's block, so repeat until none is cut.
    const spans = (day?.appointments ?? [])
      .filter((appointment) => appointment.status !== "cancelled")
      .map((appointment) => {
        const start = minutesOf(appointment.startAt)
        return {
          start,
          end: start + (appointment.endAt - appointment.startAt) / MINUTE_MS,
        }
      })
    for (
      let cut = spans.find((s) => s.start < target && target < s.end);
      cut;
    ) {
      target = cut.start
      cut = spans.find((s) => s.start < target && target < s.end)
    }
    scrollRef.current.scrollTop = Math.max(
      0,
      (target - range.start) * PX_PER_MINUTE
    )
  }, [site._id, date, range, isToday, now, day])

  if (day === undefined) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }

  const dialogs = (
    <>
      <ClosureDialog
        calendar={closing}
        calendars={day.resources}
        onClose={() => setClosing(null)}
      />
      <OpeningDialog
        calendar={opening}
        calendars={day.resources}
        onClose={() => setOpening(null)}
      />
      <HoursDialog
        calendar={editingHours}
        onClose={() => setEditingHours(null)}
      />
    </>
  )

  const headers = (style: React.CSSProperties) => (
    <div className="sticky top-0 z-30 grid border-b bg-card" style={style}>
      <div className="sticky left-0 z-10 border-r bg-card" />
      {day.resources.map((resource) => (
        <ColumnHeader
          key={resource._id}
          resource={resource}
          appointments={day.appointments.filter(
            (a) => a.resourceId === resource._id
          )}
          isAdmin={isAdmin}
          onAddClosure={() => setClosing(resource)}
          onAddOpening={() => setOpening(resource)}
          onEditHours={() => setEditingHours(resource)}
        />
      ))}
    </div>
  )

  if (day.resources.length === 0) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyTitle>Ennek a telephelynek még nincs naptára</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  // A day when nothing works keeps the board's columns, closed, so admins
  // open a calendar where it lives.
  if (!range) {
    const closedColumns = {
      gridTemplateColumns: [
        "4rem",
        ...day.resources.map(() => "minmax(10rem, 1fr)"),
      ].join(" "),
    }
    return (
      <div className="relative h-full">
        <div className="flex h-full flex-col overflow-auto overscroll-contain">
          <div className="flex min-h-full min-w-max flex-col">
            {headers(closedColumns)}
            <div className="grid flex-1" style={closedColumns}>
              <div className="sticky left-0 z-20 border-r bg-card" />
              {day.resources.map((resource) => (
                <div
                  key={resource._id}
                  className="relative border-r bg-offhours hatch last:border-r-0"
                >
                  {/* Past days can't be opened. */}
                  {isAdmin && date >= today && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="m-2 bg-card dark:bg-card"
                      aria-label={`Megnyitás: ${resource.name}`}
                      onClick={() => setOpening(resource)}
                    >
                      <CalendarPlusIcon />
                      Megnyitás
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-4 top-1/2 z-[25] flex -translate-y-1/2 justify-center">
          <div
            data-slot="empty"
            className="w-full max-w-sm rounded-lg border bg-card px-5 py-4 text-center shadow-xs"
          >
            <p className="text-base font-medium">Ezen a napon nincs rendelés</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A {site.name} egyik naptára sem rendel ezen a napon.{" "}
              {isAdmin && date >= today
                ? "Válasszon másik napot, vagy nyisson meg egy naptárt a Megnyitás gombbal."
                : "Válasszon másik napot."}
            </p>
          </div>
        </div>
        {dialogs}
      </div>
    )
  }

  const height = (range.end - range.start) * PX_PER_MINUTE
  // A calendar closed for the day keeps only a narrow labelled column.
  const columns = {
    gridTemplateColumns: [
      "4rem",
      ...day.resources.map((resource) =>
        resource.hours.length > 0 ? "minmax(13rem, 1fr)" : "8rem"
      ),
    ].join(" "),
  }
  const nowMinutes = minutesOf(now)
  const showNow =
    isToday && nowMinutes >= range.start && nowMinutes <= range.end

  return (
    <div ref={scrollRef} className="h-full overflow-auto overscroll-contain">
      <div className="min-w-max">
        {headers(columns)}

        <div className="relative grid" style={{ ...columns, height }}>
          <div className="sticky left-0 z-20 border-r bg-card" aria-hidden>
            {Array.from(
              { length: (range.end - range.start) / 60 },
              (_, index) => {
                const minutes = range.start + index * 60
                return (
                  <span
                    key={minutes}
                    className="absolute right-2 text-xs text-muted-foreground tabular"
                    style={{ top: index * 60 * PX_PER_MINUTE + 3 }}
                  >
                    {clock(minutes)}
                  </span>
                )
              }
            )}
          </div>

          {day.resources.map((resource) => (
            <Column
              key={resource._id}
              resource={resource}
              appointments={day.appointments.filter(
                (a) => a.resourceId === resource._id
              )}
              rangeStart={range.start}
            />
          ))}

          {showNow && <NowLine minutes={nowMinutes} rangeStart={range.start} />}
        </div>
      </div>
      {dialogs}
    </div>
  )
}

function ColumnHeader({
  resource,
  appointments,
  isAdmin,
  onAddClosure,
  onAddOpening,
  onEditHours,
}: {
  resource: Resource
  appointments: Appointment[]
  isAdmin: boolean
  onAddClosure: () => void
  onAddOpening: () => void
  onEditHours: () => void
}) {
  const headerRef = useRef<HTMLDivElement>(null)
  const busy = appointments
    .filter((a) => occupiesSlot(a.status))
    .map((a) => ({ start: a.startAt, end: a.endAt }))
  const working = totalMinutes(resource.working)
  const free = totalMinutes(subtractIntervals(resource.working, busy))
  const load =
    working > 0 ? Math.round(((working - free) / working) * 100) : null

  return (
    <div
      ref={headerRef}
      className="flex min-w-0 flex-col gap-1 border-r px-3 py-2 last:border-r-0"
    >
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {resource.name}
        </span>
        {resource.openings.length > 0 && (
          <OpeningsBadge
            resource={resource}
            appointments={appointments}
            isAdmin={isAdmin}
            anchor={headerRef}
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                // 40 px to touch on phones; the negative margin keeps the
                // header row its desktop height.
                className="-my-1 -mr-1.5 text-muted-foreground max-sm:-my-2.5 max-sm:size-10"
                aria-label={`Naptár beállításai: ${resource.name}`}
                title="Naptár beállításai"
              />
            }
          >
            <EllipsisVerticalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto">
            <DropdownMenuItem onClick={onAddClosure}>
              <CalendarOffIcon />
              Zárás rögzítése…
            </DropdownMenuItem>
            {isAdmin && (
              <>
                <DropdownMenuItem onClick={onAddOpening}>
                  <CalendarPlusIcon />
                  Rendkívüli nyitás rögzítése…
                </DropdownMenuItem>
                {/* One day above, every week below. */}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onEditHours}>
                  <CalendarClockIcon />
                  Heti rendelési idő…
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {load === null ? (
        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          {resource.hours.length > 0 ? (
            <>
              <LockIcon className="size-3 shrink-0" aria-hidden />
              <span className="truncate">
                Zárva: {resource.closures[0]?.reason}
              </span>
            </>
          ) : (
            "Nem rendel"
          )}
        </span>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular">{busy.length} foglalás</span>
          <div
            role="meter"
            aria-label="Foglaltság"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={load}
            className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${load}%` }}
            />
          </div>
          <span className="w-9 text-right font-medium text-foreground tabular">
            {load}%
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * Marks a calendar that works extra hours today, with their times. The
 * popover lists them; admins can delete one that holds no bookings.
 */
function OpeningsBadge({
  resource,
  appointments,
  isAdmin,
  anchor,
}: {
  resource: Resource
  appointments: Appointment[]
  isAdmin: boolean
  /** The column header; the popover opens below it, clear of its meter. */
  anchor: React.RefObject<HTMLDivElement | null>
}) {
  const spans = resource.openings.map((opening) =>
    formatTimeRange(opening.startAt, opening.endAt)
  )
  return (
    <Popover>
      <PopoverTrigger
        className="-my-1 flex min-w-0 shrink items-center gap-1 rounded-sm bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary outline-none hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-primary/20"
        aria-label={`Rendkívüli nyitás: ${spans.join(", ")}`}
      >
        <CalendarPlusIcon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">
          Rendkívüli{" "}
          {/* Phones keep the column narrow; the popover has the times. */}
          <span className="tabular max-sm:hidden">
            {spans[0]}
            {spans.length > 1 && ` +${spans.length - 1}`}
          </span>
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" anchor={anchor} className="w-80">
        <PopoverHeader>
          <PopoverTitle>{resource.name}: rendkívüli nyitás</PopoverTitle>
          <PopoverDescription>A heti rendelési időn felül.</PopoverDescription>
        </PopoverHeader>
        <ul className="flex flex-col divide-y">
          {resource.openings.map((opening) => (
            <OpeningItem
              key={opening._id}
              opening={opening}
              resourceName={resource.name}
              booked={
                appointments.filter(
                  (a) =>
                    occupiesSlot(a.status) &&
                    a.startAt < opening.endAt &&
                    opening.startAt < a.endAt
                ).length
              }
              isAdmin={isAdmin}
            />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function OpeningItem({
  opening,
  resourceName,
  booked,
  isAdmin,
}: {
  opening: Opening
  resourceName: string
  /** Bookings inside the opening; while there are any it can't be deleted. */
  booked: number
  isAdmin: boolean
}) {
  const removeOpening = useMutation(api.schedule.removeOpening)
  const [removing, setRemoving] = useState(false)

  async function remove() {
    setRemoving(true)
    try {
      await removeOpening({ openingId: opening._id })
      toast.success("Rendkívüli nyitás törölve", {
        description: `${resourceName}: ez az idő már nem foglalható.`,
      })
    } catch (error) {
      toast.error(errorMessage(error))
      setRemoving(false)
    }
  }

  return (
    <li className="flex flex-col gap-1.5 py-2 text-sm first:pt-0 last:pb-0">
      <span className="font-medium tabular">
        {formatTimeRange(opening.startAt, opening.endAt)}
      </span>
      {opening.note && (
        <span className="flex gap-1.5 text-muted-foreground">
          <MessageSquareTextIcon
            className="mt-0.5 size-3.5 shrink-0"
            aria-label="Megjegyzés"
          />
          {opening.note}
        </span>
      )}
      <span className="tabular">
        {booked > 0 ? `${booked} foglalás erre az időre` : "Még nincs foglalás"}
      </span>
      {/* A blocked delete is a lock line, not a disabled button, which
          read as enabled in dark. */}
      {isAdmin &&
        (booked > 0 ? (
          <span className="flex gap-1.5 pt-1 text-muted-foreground">
            <LockIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Amíg foglalás van rajta, nem törölhető. Helyezze át vagy mondja le a
            foglalásokat.
          </span>
        ) : (
          <Button
            variant="destructive"
            size="sm"
            className="mt-1 self-start"
            disabled={removing}
            onClick={() => void remove()}
          >
            {removing && <Spinner />}
            Nyitás törlése
          </Button>
        ))}
    </li>
  )
}

function Column({
  resource,
  appointments,
  rangeStart,
}: {
  resource: Resource
  appointments: Appointment[]
  rangeStart: number
}) {
  const { date, openBooking, bookingDraft } = useDesk()
  const y = (instant: number) =>
    (minutesOf(instant) - rangeStart) * PX_PER_MINUTE
  const draft =
    bookingDraft?.resourceId === resource._id &&
    instantToZoned(bookingDraft.startAt).date === date
      ? bookingDraft
      : null

  // Clicking open working time starts a booking at that time.
  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    const offset =
      event.clientY - event.currentTarget.getBoundingClientRect().top
    const minutes =
      rangeStart +
      Math.floor(offset / PX_PER_MINUTE / SNAP_MINUTES) * SNAP_MINUTES
    const at = clock(minutes)
    const instant = zonedTimeToInstant(date, at)
    if (
      resource.working.some(
        (shift) => shift.start <= instant && instant < shift.end
      )
    ) {
      openBooking(resource._id, at)
    }
  }

  return (
    <div className="relative border-r text-foreground last:border-r-0">
      <div className="absolute inset-0 bg-offhours hatch" aria-hidden />
      {/* Extra hours carry a perforated rail on the column's right edge,
          the opposite of the closed hatch; the header chip names them. */}
      {resource.openings.map((opening) => (
        <div
          key={opening._id}
          aria-hidden
          className="pointer-events-none absolute right-0 z-[3] w-[3px] bg-[repeating-linear-gradient(to_bottom,var(--primary)_0_6px,transparent_6px_10px)]"
          style={{
            top: y(opening.startAt),
            height:
              ((opening.endAt - opening.startAt) / MINUTE_MS) * PX_PER_MINUTE,
          }}
        />
      ))}
      {resource.working.map((shift) => (
        <div
          key={shift.start}
          className="absolute inset-x-0 bg-card"
          style={{
            top: y(shift.start),
            height: ((shift.end - shift.start) / MINUTE_MS) * PX_PER_MINUTE,
          }}
          aria-hidden
        />
      ))}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${60 * PX_PER_MINUTE}px), repeating-linear-gradient(to bottom, var(--gridline) 0 1px, transparent 1px ${30 * PX_PER_MINUTE}px)`,
        }}
        onClick={onClick}
      />
      {resource.closures.flatMap((closure) =>
        // Drawn only over weekly hours; outside them the column is closed anyway.
        mergeIntervals(resource.hours).flatMap((shift) => {
          const start = Math.max(shift.start, closure.startAt)
          const end = Math.min(shift.end, closure.endAt)
          if (end <= start) return []
          return (
            <ClosureBlock
              key={`${closure._id}-${shift.start}`}
              closure={closure}
              resourceName={resource.name}
              affected={
                appointments.filter(
                  (a) =>
                    occupiesSlot(a.status) &&
                    a.startAt < closure.endAt &&
                    closure.startAt < a.endAt
                ).length
              }
              top={y(start)}
              height={((end - start) / MINUTE_MS) * PX_PER_MINUTE}
            />
          )
        })
      )}
      {appointments.map((appointment) => (
        <AppointmentBlock
          key={appointment._id}
          appointment={appointment}
          top={y(appointment.startAt)}
          height={
            ((appointment.endAt - appointment.startAt) / MINUTE_MS) *
            PX_PER_MINUTE
          }
        />
      ))}
      {draft && (
        <DraftBlock
          startAt={draft.startAt}
          endAt={draft.endAt}
          moving={draft.moving !== undefined}
          top={y(draft.startAt)}
          height={((draft.endAt - draft.startAt) / MINUTE_MS) * PX_PER_MINUTE}
        />
      )}
    </div>
  )
}

/**
 * The slot being booked, or the new time of a booking being moved, drawn as a
 * dashed placeholder. Its fill is opaque so a move's draft covers the faded
 * old block it may overlap. The booking sheet carries the details, so it is
 * hidden from assistive tech. It scrolls into view when the time changes.
 */
function DraftBlock({
  startAt,
  endAt,
  moving,
  top,
  height,
}: {
  startAt: number
  endAt: number
  moving: boolean
  top: number
  height: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [startAt])

  return (
    <>
      <div
        ref={ref}
        aria-hidden
        // Above booked blocks (10), below the selected block (15). The scroll
        // margins keep its neighbours in view and clear the sticky header and
        // time gutter. From `sm` the booking sheet covers the right 32rem of
        // the board, so the right margin reveals the draft left of the sheet.
        className="pointer-events-none absolute inset-x-1 z-[12] flex scroll-mt-32 scroll-mb-24 scroll-ml-18 items-center gap-1.5 overflow-hidden rounded-sm border border-dashed border-primary bg-[color-mix(in_oklab,var(--primary)_10%,var(--card))] px-2 text-xs leading-tight text-primary sm:scroll-mr-[32rem]"
        style={{ top: top + 1, height: Math.max(height - 2, 14) }}
      >
        <PlusIcon className="size-3.5 shrink-0" />
        <span className="shrink-0 font-semibold tabular">
          {formatTimeRange(startAt, endAt)}
        </span>
        <span className="truncate">
          {moving ? "Új időpont" : "Új foglalás"}
        </span>
      </div>
      {/* Lets the board scroll far enough to clear the sheet for the last
          calendars. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-full hidden h-px w-[32rem] sm:block"
      />
    </>
  )
}

/**
 * Closed time on a calendar. The hatching beneath already reads as "not
 * bookable"; the label says why, and its popover lets staff reopen it. The
 * count covers the day shown, since the board only has that day's bookings.
 */
function ClosureBlock({
  closure,
  resourceName,
  affected,
  top,
  height,
}: {
  closure: Closure
  resourceName: string
  affected: number
  top: number
  height: number
}) {
  const { today } = useDesk()
  const removeClosure = useMutation(api.schedule.removeClosure)
  const [removing, setRemoving] = useState(false)
  const span = formatClosureSpan(closure, parseLocalDate(today).year)

  async function remove() {
    setRemoving(true)
    try {
      await removeClosure({ closureId: closure._id })
      toast.success("Zárás feloldva", {
        description: `${resourceName}: ez az idő újra foglalható.`,
      })
    } catch (error) {
      toast.error(errorMessage(error))
      setRemoving(false)
    }
  }

  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-0 z-[5] border-y border-dashed border-muted-foreground/40"
        style={{ top, height }}
        aria-hidden
      />
      <Popover>
        {/* The label sits above bookings (11 > 10), top right, so a closure
            that starts inside a booking still shows why and can be opened. */}
        <PopoverTrigger
          className="absolute right-1 z-[11] flex max-w-[calc(100%-0.5rem)] items-center gap-1 rounded-sm border bg-card px-1.5 py-0.5 text-left text-xs text-muted-foreground shadow-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          style={{ top: top + 2 }}
          aria-label={`Zárva: ${closure.reason}, ${span}`}
        >
          <LockIcon className="size-3 shrink-0" aria-hidden />
          <span className="truncate">
            <span className="font-medium text-foreground">
              {closure.reason}
            </span>
            {affected > 0 && `, ${affected} foglalás áthelyezendő`}
          </span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <PopoverHeader>
            <PopoverTitle>Zárva: {closure.reason}</PopoverTitle>
            <PopoverDescription>
              {resourceName}, <span className="tabular">{span}</span>
            </PopoverDescription>
          </PopoverHeader>
          {affected > 0 && (
            <p className="text-sm">
              Ezen a napon {affected} foglalás esik a zárásra. Helyezze át vagy
              mondja le őket.
            </p>
          )}
          <Button
            variant="outline"
            disabled={removing}
            onClick={() => void remove()}
          >
            {removing && <Spinner />}
            Zárás feloldása
          </Button>
        </PopoverContent>
      </Popover>
    </>
  )
}

/** "november 10., kedd, 12:00–15:00", or a day range for whole days. */
function formatClosureSpan(closure: Closure, currentYear: number) {
  const start = instantToZoned(closure.startAt)
  const end = instantToZoned(closure.endAt)
  const lastDay = instantToZoned(closure.endAt - 1).date
  if (start.minutes === 0 && end.minutes === 0) {
    return start.date === lastDay
      ? formatDay(start.date, currentYear)
      : `${formatDay(start.date, currentYear)} – ${formatDay(lastDay, currentYear)}`
  }
  if (start.date === end.date) {
    return `${formatDay(start.date, currentYear)}, ${formatTimeRange(closure.startAt, closure.endAt)}`
  }
  return `${formatDay(start.date, currentYear)} ${formatTime(closure.startAt)} – ${formatDay(end.date, currentYear)} ${formatTime(closure.endAt)}`
}

const blockStyle: Record<
  Exclude<Appointment["status"], "cancelled">,
  string
> = {
  booked: "border-l-status-booked bg-status-booked-surface",
  arrived: "border-l-status-arrived bg-status-arrived-surface",
  completed:
    "border-l-status-completed bg-status-completed-surface text-muted-foreground",
  noShow:
    "hatch border-dashed border-status-noshow/60 border-l-status-noshow bg-status-noshow-surface text-muted-foreground",
}

function AppointmentBlock({
  appointment,
  top,
  height,
}: {
  appointment: Appointment
  top: number
  height: number
}) {
  const {
    openAppointment,
    selectedAppointment,
    bookingDraft,
    now,
    date,
    today,
  } = useDesk()
  const { status } = appointment
  if (status === "cancelled") return null
  const selected = appointment._id === selectedAppointment
  const beingMoved = bookingDraft?.moving === appointment._id
  // The now-line runs under blocks (rule 6), so a block that spans now gets a
  // laser notch on its status bar instead, clear of the text.
  const spansNow =
    date === today && appointment.startAt <= now && now < appointment.endAt
  const nowOffset =
    ((now - appointment.startAt) / MINUTE_MS) * PX_PER_MINUTE - 1
  const compact = height < 42
  const name = appointment.patient?.name ?? "Ismeretlen páciens"
  const service = appointment.service?.name ?? "Törölt vizsgálat"

  return (
    <button
      type="button"
      onClick={() => openAppointment(appointment._id)}
      aria-current={selected ? "true" : undefined}
      aria-label={`${formatTimeRange(appointment.startAt, appointment.endAt)}, ${name}, ${service}, ${statusLabel[status]}`}
      className={cn(
        "absolute inset-x-1 flex flex-col overflow-hidden rounded-sm border border-l-[3px] border-transparent px-2 text-left outline-none hover:brightness-[0.97] focus-visible:z-[16] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card dark:hover:brightness-110",
        compact ? "justify-center py-0" : "py-1",
        blockStyle[status],
        // A no-show releases its slot; a rebooking on top of it must stay readable.
        occupiesSlot(status) ? "z-10" : "z-[2]",
        // The block whose details are open stays marked while staff work in the sheet.
        // Layering: now-line 1 < no-show 2 < closure 5 < booked 10 < closure
        // label 11 < booking draft 12 < selected 15 < focused 16 < sticky
        // gutter 20, now label 25, header 30.
        selected && "z-[15] shadow-md ring-2 ring-primary",
        // While it is moved, the old place reads as "going away".
        beingMoved && "opacity-45"
      )}
      style={{ top: top + 1, height: Math.max(height - 2, 14) }}
    >
      {spansNow && (
        <span
          className="pointer-events-none absolute left-0 h-[3px] w-1.5 -translate-y-1/2 bg-laser"
          style={{ top: nowOffset }}
          aria-hidden
        />
      )}
      <span className="flex min-w-0 items-center gap-1.5 text-[13px] leading-tight">
        <span className="shrink-0 text-xs text-muted-foreground tabular">
          {formatTime(appointment.startAt)}
        </span>
        <span
          className={cn(
            "truncate font-semibold",
            // On one-line blocks the name yields at most part of the line to the exam.
            compact && "max-w-[60%] shrink-0",
            status === "noShow" && "line-through decoration-1"
          )}
        >
          {name}
        </span>
        {compact && (
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {service}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1 text-muted-foreground [&_svg]:size-3.5">
          {/* Booked is the default and carries no icon; the rest match the list. */}
          {status !== "booked" && <StatusIcon status={status} />}
          {appointment.service?.contrast && (
            <DropletIcon aria-label="Kontrasztanyagos" />
          )}
          {appointment.note && (
            <MessageSquareTextIcon aria-label="Megjegyzés" />
          )}
          {appointment.source === "partner" && (
            <HandshakeIcon aria-label={sourceLabel.partner} />
          )}
          {appointment.source === "online" && (
            <GlobeIcon aria-label={sourceLabel.online} />
          )}
        </span>
      </span>
      {!compact && (
        <span className="truncate text-xs leading-snug text-muted-foreground">
          {status === "noShow" ? `${statusLabel.noShow}, ${service}` : service}
        </span>
      )}
    </button>
  )
}

function StatusIcon({ status }: { status: Appointment["status"] }) {
  const { icon: Icon, className } = statusIcon[status]
  return <Icon className={className} aria-hidden />
}

function NowLine({
  minutes,
  rangeStart,
}: {
  minutes: number
  rangeStart: number
}) {
  const top = (minutes - rangeStart) * PX_PER_MINUTE
  // The line runs under appointment blocks: drawn across their text it reads
  // as a strikethrough, which means "cancelled". The label sits above the
  // time gutter.
  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-0 z-[1] h-px bg-laser shadow-[0_0_6px_1px_var(--laser)]"
        style={{ top }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-0 z-[25] h-px w-16 bg-laser"
        style={{ top }}
        aria-hidden
      />
      <span
        className="pointer-events-none absolute left-1 z-[25] -translate-y-1/2 rounded-sm bg-laser px-1.5 py-px text-[11px] font-semibold text-laser-foreground tabular"
        style={{ top }}
        aria-hidden
      >
        {clock(minutes)}
      </span>
    </>
  )
}
