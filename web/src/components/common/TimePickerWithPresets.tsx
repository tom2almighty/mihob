import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"))

const TIME_PRESETS = [
  { value: "00:00", labelKey: "common.timePresets.midnight" as const },
  { value: "08:00", labelKey: "common.timePresets.morning8" as const },
  { value: "09:00", labelKey: "common.timePresets.morning9" as const },
  { value: "12:00", labelKey: "common.timePresets.noon" as const },
  { value: "18:00", labelKey: "common.timePresets.evening18" as const },
  { value: "21:00", labelKey: "common.timePresets.night21" as const },
  { value: "23:00", labelKey: "common.timePresets.night23" as const },
]

function normalizeTime(raw?: string): { hour: string; minute: string; formatted: string } {
  const match = (raw || "").trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) {
    return { hour: "09", minute: "00", formatted: "09:00" }
  }
  const h = Math.min(23, Math.max(0, Number(match[1])))
  const m = Math.min(59, Math.max(0, Number(match[2])))
  const hour = String(h).padStart(2, "0")
  const minute = String(m).padStart(2, "0")
  return { hour, minute, formatted: `${hour}:${minute}` }
}

export function TimePickerWithPresets({
  value,
  onChange,
  id,
  placeholder,
}: {
  value?: string
  onChange: (value: string) => void
  id?: string
  placeholder?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [presetKey, setPresetKey] = useState("")
  const { hour, minute, formatted } = normalizeTime(value)

  // Include current custom minute if not on a 5-minute step
  const minuteOptions = useMemo(() => {
    if (MINUTES.includes(minute)) return MINUTES
    return [...MINUTES, minute].sort()
  }, [minute])

  const handlePreset = (val: string | null) => {
    if (!val) return
    setPresetKey(val)
    onChange(val)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setPresetKey("")
      }}
      modal
    >
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            className="w-full justify-start font-normal tabular-nums"
          />
        }
      >
        <Clock className="mr-2 size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{formatted || placeholder || "09:00"}</span>
      </PopoverTrigger>
      <PopoverContent className="flex w-60 flex-col gap-2 p-2.5" align="start">
        <Select value={presetKey} onValueChange={handlePreset}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("common.timePresets.placeholder")} />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {TIME_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value} className="tabular-nums">
                {t(p.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="grid grid-cols-2 divide-x divide-border rounded-md border border-border bg-background/50">
          <div className="flex flex-col">
            <div className="border-b border-border/70 px-2 py-1 text-center text-[11px] font-medium text-muted-foreground">
              {t("common.timePresets.hourLabel")}
            </div>
            <div className="grid max-h-48 grid-cols-2 gap-0.5 overflow-y-auto p-1">
              {HOURS.map((h) => {
                const selected = h === hour
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => onChange(`${h}:${minute}`)}
                    className={cn(
                      "rounded-md py-1 text-center text-xs tabular-nums transition-colors",
                      selected
                        ? "bg-primary font-medium text-primary-foreground"
                        : "text-foreground hover:bg-muted dark:hover:bg-[color-mix(in_oklch,var(--foreground)_8%,transparent)]"
                    )}
                  >
                    {h}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col">
            <div className="border-b border-border/70 px-2 py-1 text-center text-[11px] font-medium text-muted-foreground">
              {t("common.timePresets.minuteLabel")}
            </div>
            <div className="grid max-h-48 grid-cols-2 gap-0.5 overflow-y-auto p-1">
              {minuteOptions.map((m) => {
                const selected = m === minute
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      onChange(`${hour}:${m}`)
                      setOpen(false)
                    }}
                    className={cn(
                      "rounded-md py-1 text-center text-xs tabular-nums transition-colors",
                      selected
                        ? "bg-primary font-medium text-primary-foreground"
                        : "text-foreground hover:bg-muted dark:hover:bg-[color-mix(in_oklch,var(--foreground)_8%,transparent)]"
                    )}
                  >
                    {m}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
