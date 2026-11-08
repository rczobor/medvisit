import { Link, useNavigate } from "@tanstack/react-router"
import { cn } from "cn"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  UserSearchIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import type { Id } from "../../convex/_generated/dataModel"
import { addDays, parseLocalDate } from "../../convex/lib/time"
import { useDesk } from "@/components/desk-context"
import { DatePicker } from "@/components/date-picker"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const segment =
  "inline-flex items-center rounded-[calc(var(--radius)-2px)] px-2.5 py-1 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
const segmentActive = "bg-card font-medium text-foreground shadow-xs"
const segmentIdle = "text-muted-foreground hover:text-foreground"

export function AppHeader({
  sites,
}: {
  sites: { _id: Id<"sites">; name: string }[]
}) {
  const { site, date, today, openBooking, openPatient } = useDesk()
  const navigate = useNavigate()
  const { resolvedTheme, setTheme } = useTheme()

  return (
    // Phones: brand and the main action; a site dropdown and the view; the day.
    // Tablets: the site switch gets its own row, then the day and the view.
    // From lg up everything sits on one row.
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-card px-4 py-2 lg:gap-x-5">
      <span className="order-1 text-[15px] font-bold tracking-tight">
        MedVisit
      </span>

      {/* Three site names don't fit a phone's width as tabs. */}
      <Select
        items={sites.map((candidate) => ({
          value: candidate._id,
          label: candidate.name,
        }))}
        value={site._id}
        onValueChange={(value) => {
          if (!value) return
          void navigate({
            to: ".",
            search: (previous) => ({
              ...previous,
              site: value,
              book: undefined,
              move: undefined,
            }),
          })
        }}
      >
        <SelectTrigger
          aria-label="Telephely"
          className="order-3 min-w-40 flex-1 font-medium sm:hidden"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sites.map((candidate) => (
            <SelectItem key={candidate._id} value={candidate._id}>
              {candidate.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <nav
        aria-label="Telephely"
        className="order-3 flex w-full overflow-x-auto rounded-md bg-muted p-0.5 max-sm:hidden lg:order-2 lg:w-auto"
      >
        {sites.map((candidate) => (
          <Link
            key={candidate._id}
            to="."
            search={(previous) => ({
              ...previous,
              site: candidate._id,
              book: undefined,
              move: undefined,
            })}
            aria-current={candidate._id === site._id ? "page" : undefined}
            className={cn(
              segment,
              candidate._id === site._id ? segmentActive : segmentIdle
            )}
          >
            {candidate.name}
          </Link>
        ))}
      </nav>

      <div className="order-5 flex items-center gap-1 max-sm:w-full sm:order-4 lg:order-3">
        <Link
          to="."
          search={(previous) => ({ ...previous, date: addDays(date, -1) })}
          aria-label="Előző nap"
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        >
          <ChevronLeftIcon />
        </Link>
        <DatePicker
          value={date}
          currentYear={parseLocalDate(today).year}
          className="justify-start text-[15px] font-semibold sm:min-w-56"
          onChange={(picked) =>
            void navigate({
              to: ".",
              search: (previous) => ({ ...previous, date: picked }),
            })
          }
        />
        <Link
          to="."
          search={(previous) => ({ ...previous, date: addDays(date, 1) })}
          aria-label="Következő nap"
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        >
          <ChevronRightIcon />
        </Link>
        <Link
          to="."
          search={(previous) => ({ ...previous, date: undefined })}
          // On today "Ma" reads as the selected day, not as a disabled control.
          aria-current={date === today ? "date" : undefined}
          className={cn(
            buttonVariants({
              variant: date === today ? "secondary" : "outline",
              size: "sm",
            }),
            "sm:ml-1",
            date === today && "font-semibold"
          )}
        >
          Ma
        </Link>
      </div>

      <nav
        aria-label="Nézet"
        className="order-4 ml-auto flex rounded-md bg-muted p-0.5 sm:order-5 lg:order-4 lg:ml-0"
      >
        <Link
          to="/"
          search={(previous) => previous}
          activeOptions={{ exact: true, includeSearch: false }}
          className={segment}
          activeProps={{ className: segmentActive, "aria-current": "page" }}
          inactiveProps={{ className: segmentIdle }}
        >
          Tábla
        </Link>
        <Link
          to="/lista"
          search={(previous) => previous}
          activeOptions={{ includeSearch: false }}
          className={segment}
          activeProps={{ className: segmentActive, "aria-current": "page" }}
          inactiveProps={{ className: segmentIdle }}
        >
          Lista
        </Link>
      </nav>

      <div className="order-2 ml-auto flex items-center gap-1 lg:order-5">
        <Button
          variant="outline"
          aria-label="Páciens keresése"
          onClick={() => openPatient("search")}
        >
          <UserSearchIcon />
          <span className="max-sm:hidden">Páciens</span>
        </Button>
        <Button onClick={() => openBooking()}>
          <PlusIcon />
          Új foglalás
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={resolvedTheme === "dark" ? "Világos téma" : "Sötét téma"}
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
        </Button>
      </div>
    </header>
  )
}
