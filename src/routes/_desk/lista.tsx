import { Fragment, useLayoutEffect, useRef } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { cn } from "cn"
import { DropletIcon, GlobeIcon, HandshakeIcon } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { appointmentStatuses } from "../../../convex/lib/appointmentStatus"
import { useDesk } from "@/components/desk-context"
import { StatusBadge } from "@/components/status-badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate, formatTime, formatTimeRange } from "@/lib/format"
import { sourceLabel, statusLabel } from "@/lib/labels"

export const Route = createFileRoute("/_desk/lista")({ component: DayList })

function DayList() {
  const { site, date, today, now, openAppointment } = useDesk()
  const day = useQuery(api.schedule.day, { siteId: site._id, date })
  const nowRow = useRef<HTMLTableRowElement>(null)
  const scrolledFor = useRef<string | null>(null)

  // Today's list opens at what is happening now, not at the first booking.
  useLayoutEffect(() => {
    const key = `${site._id}/${date}`
    if (!nowRow.current || scrolledFor.current === key) return
    scrolledFor.current = key
    nowRow.current.scrollIntoView({ block: "center" })
    // Then start on a whole row: the sticky header would hide the top of a
    // row cut by the centring, often its patient name.
    const container = nowRow.current.closest<HTMLElement>(
      '[data-slot="table-container"]'
    )
    const header = container?.querySelector("thead")
    if (!container || !header) return
    const edge =
      container.getBoundingClientRect().top +
      header.getBoundingClientRect().height
    for (const row of container.querySelectorAll("tbody tr")) {
      const { top, bottom } = row.getBoundingClientRect()
      if (bottom > edge + 1) {
        container.scrollTop += top - edge
        break
      }
    }
  })

  if (day === undefined) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }
  if (day.appointments.length === 0) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyTitle>Nincs foglalás erre a napra</EmptyTitle>
          <EmptyDescription>
            Új foglalást a jobb felső gombbal rögzíthet.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const resourceNames = new Map(
    day.resources.map((resource) => [resource._id, resource.name])
  )
  const rows = day.appointments.toSorted((a, b) => a.startAt - b.startAt)
  const counts = appointmentStatuses
    .map((status) => ({
      status,
      count: rows.filter((row) => row.status === status).length,
    }))
    .filter(({ count }) => count > 0)
  const isToday = date === today
  // The current-time divider goes before the first booking that hasn't started.
  const nowIndex = isToday ? rows.findIndex((row) => row.startAt > now) : -1
  const dividerAt = isToday && nowIndex === -1 ? rows.length : nowIndex

  return (
    <div className="h-full">
      <div className="mx-auto flex h-full max-w-5xl flex-col gap-3 p-4">
        {/* The total comes first so a status count isn't read as the day's total. */}
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground sm:gap-x-5">
          <span className="max-sm:w-full sm:border-r sm:pr-5">
            <span className="font-semibold text-foreground tabular">
              {rows.length}
            </span>{" "}
            foglalás
          </span>
          {counts.map(({ status, count }) => (
            <span key={status}>
              <span className="font-semibold text-foreground tabular">
                {count}
              </span>{" "}
              {statusLabel[status].toLowerCase()}
            </span>
          ))}
        </p>
        {/* The table box scrolls on its own, so its header stays in view. */}
        <div className="min-h-0 overflow-clip rounded-md border bg-card">
          <Table containerClassName="h-full overflow-auto">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="w-32 max-sm:w-auto">Idő</TableHead>
                <TableHead>Páciens</TableHead>
                <TableHead className="w-72 max-sm:hidden">Vizsgálat</TableHead>
                <TableHead className="w-36 max-sm:hidden">Naptár</TableHead>
                <TableHead className="w-40 max-sm:w-auto">Állapot</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => {
                const name = row.patient?.name ?? "Ismeretlen páciens"
                return (
                  <Fragment key={row._id}>
                    {index === dividerAt && (
                      <NowRow ref={nowRow} time={formatTime(now)} />
                    )}
                    <TableRow
                      className={cn(
                        "cursor-pointer",
                        row.status === "cancelled" && "text-muted-foreground"
                      )}
                      onClick={() => openAppointment(row._id)}
                    >
                      <TableCell className="tabular">
                        {/* Phones show the start only, so the status column fits. */}
                        <span className="sm:hidden">
                          {formatTime(row.startAt)}
                        </span>
                        <span className="max-sm:hidden">
                          {formatTimeRange(row.startAt, row.endAt)}
                        </span>
                      </TableCell>
                      <TableCell className="max-sm:whitespace-normal">
                        <button
                          type="button"
                          className={cn(
                            "text-left font-semibold outline-none hover:underline focus-visible:underline",
                            row.status === "cancelled" &&
                              "line-through decoration-1"
                          )}
                          onClick={(event) => {
                            event.stopPropagation()
                            openAppointment(row._id)
                          }}
                        >
                          {name}
                        </button>
                        {row.patient && (
                          <span className="block text-xs text-muted-foreground tabular sm:ml-2 sm:inline">
                            {formatDate(row.patient.birthDate)}
                          </span>
                        )}
                        <ExamWithSource
                          exam={row.service?.name ?? "Törölt vizsgálat"}
                          source={row.source}
                        />
                      </TableCell>
                      <TableCell className="max-sm:hidden">
                        <span className="flex items-center gap-1.5">
                          {row.service?.name ?? "Törölt vizsgálat"}
                          {row.service?.contrast && (
                            <DropletIcon
                              className="size-3.5 text-muted-foreground"
                              aria-label="Kontrasztanyagos"
                            />
                          )}
                          <SourceIcon source={row.source} />
                        </span>
                      </TableCell>
                      <TableCell className="max-sm:hidden">
                        {resourceNames.get(row.resourceId) ?? ""}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                    </TableRow>
                  </Fragment>
                )
              })}
              {dividerAt === rows.length && (
                <NowRow ref={nowRow} time={formatTime(now)} />
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}

/** The current time in the list, drawn like the board's laser line. */
function NowRow({
  time,
  ref,
}: {
  time: string
  ref: React.Ref<HTMLTableRowElement>
}) {
  return (
    <TableRow ref={ref} className="border-0 hover:bg-transparent">
      <TableCell colSpan={5} className="p-0">
        <div className="flex items-center gap-2 py-1">
          <span className="rounded-sm bg-laser px-1.5 py-px text-[11px] font-semibold text-laser-foreground tabular">
            <span className="sr-only">Most: </span>
            {time}
          </span>
          <span className="h-px flex-1 bg-laser" aria-hidden />
        </div>
      </TableCell>
    </TableRow>
  )
}

/** Same marks as the board: partner and online bookings; staff ones stay plain. */
function SourceIcon({ source }: { source: "staff" | "online" | "partner" }) {
  if (source === "partner")
    return (
      <HandshakeIcon
        className="inline size-3.5 align-[-2px] text-muted-foreground"
        aria-label={sourceLabel.partner}
      />
    )
  if (source === "online")
    return (
      <GlobeIcon
        className="inline size-3.5 align-[-2px] text-muted-foreground"
        aria-label={sourceLabel.online}
      />
    )
  return null
}

/**
 * The phone list's exam line. The last word and the source icon never break
 * apart, so the icon can't wrap onto a line of its own.
 */
function ExamWithSource({
  exam,
  source,
}: {
  exam: string
  source: "staff" | "online" | "partner"
}) {
  const split = exam.lastIndexOf(" ")
  return (
    <span className="block text-xs text-muted-foreground sm:hidden">
      {exam.slice(0, split + 1)}
      <span className="whitespace-nowrap">
        {exam.slice(split + 1)} <SourceIcon source={source} />
      </span>
    </span>
  )
}
