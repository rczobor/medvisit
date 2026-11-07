import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { cn } from "cn"
import { DropletIcon } from "lucide-react"
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
import { formatDate, formatTimeRange } from "@/lib/format"
import { sourceLabel, statusLabel } from "@/lib/labels"

export const Route = createFileRoute("/_desk/lista")({ component: DayList })

function DayList() {
  const { site, date, openAppointment } = useDesk()
  const day = useQuery(api.schedule.day, { siteId: site._id, date })

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

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 p-4">
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          {counts.map(({ status, count }) => (
            <span key={status}>
              <span className="font-semibold text-foreground tabular">
                {count}
              </span>{" "}
              {statusLabel[status].toLowerCase()}
            </span>
          ))}
        </p>
        <div className="overflow-hidden rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Idő</TableHead>
                <TableHead>Páciens</TableHead>
                <TableHead>Vizsgálat</TableHead>
                <TableHead>Naptár</TableHead>
                <TableHead>Forrás</TableHead>
                <TableHead className="w-40">Állapot</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const name = row.patient?.name ?? "Ismeretlen páciens"
                return (
                  <TableRow
                    key={row._id}
                    className={cn(
                      "cursor-pointer",
                      row.status === "cancelled" && "text-muted-foreground"
                    )}
                    onClick={() => openAppointment(row._id)}
                  >
                    <TableCell className="tabular">
                      {formatTimeRange(row.startAt, row.endAt)}
                    </TableCell>
                    <TableCell>
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
                        <span className="block text-xs text-muted-foreground tabular">
                          {formatDate(row.patient.birthDate)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        {row.service?.name ?? "Törölt vizsgálat"}
                        {row.service?.contrast && (
                          <DropletIcon
                            className="size-3.5 text-muted-foreground"
                            aria-label="Kontrasztanyagos"
                          />
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      {resourceNames.get(row.resourceId) ?? ""}
                    </TableCell>
                    <TableCell>{sourceLabel[row.source]}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
