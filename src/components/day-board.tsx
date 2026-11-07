import { useLayoutEffect, useRef } from "react"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { cn } from "cn"
import {
  CheckCheckIcon,
  CheckIcon,
  DropletIcon,
  GlobeIcon,
  HandshakeIcon,
  MessageSquareTextIcon,
} from "lucide-react"
import { api } from "../../convex/_generated/api"
import { subtractIntervals } from "../../convex/lib/availability"
import type { Interval } from "../../convex/lib/availability"
import { occupiesSlot } from "../../convex/lib/appointmentStatus"
import {
  MINUTE_MS,
  instantToZoned,
  zonedTimeToInstant,
} from "../../convex/lib/time"
import { useDesk } from "@/components/desk-context"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { formatTime, formatTimeRange } from "@/lib/format"
import { sourceLabel, statusLabel } from "@/lib/labels"

type Day = FunctionReturnType<typeof api.schedule.day>
type Resource = Day["resources"][number]
type Appointment = Day["appointments"][number]

const PX_PER_MINUTE = 2
const SNAP_MINUTES = 5

const minutesOf = (instant: number) => instantToZoned(instant).minutes
const totalMinutes = (intervals: Interval[]) =>
  intervals.reduce((sum, { start, end }) => sum + (end - start) / MINUTE_MS, 0)
const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`

/** The hours shown: every resource's working time, widened to whole hours. */
function visibleRange(day: Day) {
  const shifts = day.resources.flatMap((resource) => resource.working)
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
  const range = day ? visibleRange(day) : null
  const isToday = date === today

  // Open each day at the current time, or at the start of the day's work.
  useLayoutEffect(() => {
    const key = `${site._id}/${date}`
    if (!range || !scrollRef.current || scrolledFor.current === key) return
    scrolledFor.current = key
    const target = isToday ? minutesOf(now) - 60 : range.start
    scrollRef.current.scrollTop = Math.max(
      0,
      (target - range.start) * PX_PER_MINUTE
    )
  }, [site._id, date, range, isToday, now])

  if (day === undefined) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }

  if (!range) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyTitle>Ezen a napon nincs rendelés</EmptyTitle>
          <EmptyDescription>
            {site.name} egyik eszköze sem dolgozik ezen a napon. Válasszon másik
            napot.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const height = (range.end - range.start) * PX_PER_MINUTE
  const columns = {
    gridTemplateColumns: `4rem repeat(${day.resources.length}, minmax(13rem, 1fr))`,
  }
  const nowMinutes = minutesOf(now)
  const showNow =
    isToday && nowMinutes >= range.start && nowMinutes <= range.end

  return (
    <div ref={scrollRef} className="h-full overflow-auto overscroll-contain">
      <div className="min-w-max">
        <div
          className="sticky top-0 z-30 grid border-b bg-card"
          style={columns}
        >
          <div className="sticky left-0 z-10 border-r bg-card" />
          {day.resources.map((resource) => (
            <ColumnHeader
              key={resource._id}
              resource={resource}
              appointments={day.appointments.filter(
                (a) => a.resourceId === resource._id
              )}
            />
          ))}
        </div>

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
    </div>
  )
}

function ColumnHeader({
  resource,
  appointments,
}: {
  resource: Resource
  appointments: Appointment[]
}) {
  const busy = appointments
    .filter((a) => occupiesSlot(a.status))
    .map((a) => ({ start: a.startAt, end: a.endAt }))
  const working = totalMinutes(resource.working)
  const free = totalMinutes(subtractIntervals(resource.working, busy))
  const load =
    working > 0 ? Math.round(((working - free) / working) * 100) : null

  return (
    <div className="flex min-w-0 flex-col gap-1 border-r px-3 py-2 last:border-r-0">
      <span className="truncate text-sm font-semibold">{resource.name}</span>
      {load === null ? (
        <span className="text-xs text-muted-foreground">Ma nem rendel</span>
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

function Column({
  resource,
  appointments,
  rangeStart,
}: {
  resource: Resource
  appointments: Appointment[]
  rangeStart: number
}) {
  const { date, openBooking } = useDesk()
  const y = (instant: number) =>
    (minutesOf(instant) - rangeStart) * PX_PER_MINUTE

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
    </div>
  )
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
  const { openAppointment } = useDesk()
  const { status } = appointment
  if (status === "cancelled") return null
  const compact = height < 42
  const name = appointment.patient?.name ?? "Ismeretlen páciens"
  const service = appointment.service?.name ?? "Törölt vizsgálat"

  return (
    <button
      type="button"
      onClick={() => openAppointment(appointment._id)}
      aria-label={`${formatTimeRange(appointment.startAt, appointment.endAt)}, ${name}, ${service}, ${statusLabel[status]}`}
      className={cn(
        "absolute inset-x-1 flex flex-col overflow-hidden rounded-sm border border-l-[3px] border-transparent px-2 text-left outline-none hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-ring dark:hover:brightness-110",
        compact ? "justify-center py-0" : "py-1",
        blockStyle[status],
        // A no-show releases its slot; a rebooking on top of it must stay readable.
        occupiesSlot(status) ? "z-10" : "z-0"
      )}
      style={{ top: top + 1, height: Math.max(height - 2, 14) }}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-[13px] leading-tight">
        <span className="shrink-0 text-xs text-muted-foreground tabular">
          {formatTime(appointment.startAt)}
        </span>
        <span
          className={cn(
            "truncate font-semibold",
            status === "noShow" && "line-through decoration-1"
          )}
        >
          {name}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-muted-foreground [&_svg]:size-3.5">
          {status === "arrived" && (
            <CheckIcon className="text-status-arrived" aria-hidden />
          )}
          {status === "completed" && <CheckCheckIcon aria-hidden />}
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

function NowLine({
  minutes,
  rangeStart,
}: {
  minutes: number
  rangeStart: number
}) {
  const top = (minutes - rangeStart) * PX_PER_MINUTE
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-[25]"
      style={{ top }}
      aria-hidden
    >
      <div className="h-px bg-laser shadow-[0_0_6px_1px_var(--laser)]" />
      <span className="absolute top-0 left-1 -translate-y-1/2 rounded-sm bg-laser px-1.5 py-px text-[11px] font-semibold text-white tabular">
        {clock(minutes)}
      </span>
    </div>
  )
}
