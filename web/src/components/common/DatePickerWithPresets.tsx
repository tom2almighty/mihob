import { useState } from "react"
import { useTranslation } from "react-i18next"
import { addDays, format, isValid, parse } from "date-fns"
import { enUS, zhCN } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { normalizeLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

function parseDateValue(value?: string): Date | undefined {
  if (!value) return undefined
  const parsed = parse(value, "yyyy-MM-dd", new Date())
  return isValid(parsed) ? parsed : undefined
}

export function DatePickerWithPresets({
  value,
  onChange,
  placeholder,
  id,
}: {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  id?: string
}) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [presetKey, setPresetKey] = useState<string>("")
  const selectedDate = parseDateValue(value)
  const isPermanent = !selectedDate
  const calendarLocale =
    normalizeLanguage(i18n.resolvedLanguage || i18n.language) === "zh-CN" ? zhCN : enUS
  const currentYear = new Date().getFullYear()

  const handlePreset = (val: string | null) => {
    if (!val) return
    setPresetKey(val)
    if (val === "permanent") {
      onChange("")
      setOpen(false)
      return
    }
    const days = Number(val)
    if (!Number.isNaN(days) && days > 0) {
      onChange(format(addDays(new Date(), days), "yyyy-MM-dd"))
      setOpen(false)
    }
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
            className={cn(
              "w-full justify-start font-normal tabular-nums",
              isPermanent && "text-muted-foreground"
            )}
          />
        }
      >
        <CalendarIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">
          {selectedDate
            ? format(selectedDate, "yyyy-MM-dd")
            : (placeholder ?? t("common.datePresets.permanentPlaceholder"))}
        </span>
      </PopoverTrigger>
      <PopoverContent className="flex w-auto flex-col gap-2 p-2.5" align="start">
        <Select value={presetKey} onValueChange={handlePreset}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("common.datePresets.placeholder")} />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectItem value="7">{t("common.datePresets.plus7d")}</SelectItem>
            <SelectItem value="30">{t("common.datePresets.plus30d")}</SelectItem>
            <SelectItem value="90">{t("common.datePresets.plus90d")}</SelectItem>
            <SelectItem value="180">{t("common.datePresets.plus180d")}</SelectItem>
            <SelectItem value="365">{t("common.datePresets.plus1y")}</SelectItem>
            <SelectItem value="permanent">{t("common.datePresets.permanent")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="rounded-md border border-border">
          <Calendar
            mode="single"
            locale={calendarLocale}
            captionLayout="dropdown"
            selected={selectedDate}
            defaultMonth={selectedDate ?? new Date()}
            startMonth={new Date(currentYear - 1, 0)}
            endMonth={new Date(currentYear + 20, 11)}
            onSelect={(date) => {
              onChange(date ? format(date, "yyyy-MM-dd") : "")
              setOpen(false)
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
