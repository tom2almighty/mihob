import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { api, queryKeys } from "@/lib/api"
import type { NotificationChannel, NotificationSchedule } from "@/lib/types"
import { TIMEZONE_OPTIONS } from "./constants"

export function ScheduleFormDialog({
  open,
  onOpenChange,
  schedule,
  channels,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  schedule: NotificationSchedule | null
  channels: NotificationChannel[]
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const isEdit = Boolean(schedule)

  const [name, setName] = useState("")
  const [enabled, setEnabled] = useState(true)
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("daily")
  const [timeOfDay, setTimeOfDay] = useState("09:00")
  const [weekday, setWeekday] = useState(1)
  const [dayOfMonth, setDayOfMonth] = useState(1)
  const [timezone, setTimezone] = useState("Asia/Shanghai")
  const [trafficMode, setTrafficMode] = useState<"used" | "remaining">("used")
  const [includeSummary, setIncludeSummary] = useState(true)
  const [includeNodeTraffic, setIncludeNodeTraffic] = useState(true)
  const [nodeLimit, setNodeLimit] = useState(0)
  const [includeExpiring, setIncludeExpiring] = useState(true)
  const [includeTopUsers, setIncludeTopUsers] = useState(false)
  const [allChannels, setAllChannels] = useState(true)
  const [channelIds, setChannelIds] = useState<number[]>([])

  useEffect(() => {
    if (!open) return
    if (schedule) {
      setName(schedule.name)
      setEnabled(schedule.enabled)
      setFrequency(schedule.frequency)
      setTimeOfDay(schedule.time_of_day || "09:00")
      setWeekday(schedule.weekday ?? 1)
      setDayOfMonth(schedule.day_of_month || 1)
      setTimezone(schedule.timezone || "Asia/Shanghai")
      setTrafficMode(schedule.traffic_display_mode === "remaining" ? "remaining" : "used")
      setIncludeSummary(schedule.include_summary)
      setIncludeNodeTraffic(schedule.include_node_traffic)
      setNodeLimit(schedule.node_limit || 0)
      setIncludeExpiring(schedule.include_expiring)
      setIncludeTopUsers(schedule.include_top_users)
      const cids = schedule.channel_ids ?? []
      setAllChannels(cids.length === 0)
      setChannelIds(cids)
    } else {
      setName("")
      setEnabled(true)
      setFrequency("daily")
      setTimeOfDay("09:00")
      setWeekday(1)
      setDayOfMonth(1)
      setTimezone("Asia/Shanghai")
      setTrafficMode("used")
      setIncludeSummary(true)
      setIncludeNodeTraffic(true)
      setNodeLimit(0)
      setIncludeExpiring(true)
      setIncludeTopUsers(false)
      setAllChannels(true)
      setChannelIds([])
    }
  }, [open, schedule])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) {
        throw new Error(t("notifications.schedules.validation.nameRequired"))
      }
      const payload = {
        name: name.trim(),
        enabled,
        frequency,
        time_of_day: timeOfDay,
        weekday,
        day_of_month: dayOfMonth,
        timezone,
        traffic_display_mode: trafficMode,
        include_summary: includeSummary,
        include_node_traffic: includeNodeTraffic,
        node_limit: nodeLimit,
        include_expiring: includeExpiring,
        include_top_users: includeTopUsers,
        channel_ids: allChannels ? [] : channelIds,
      }
      if (isEdit && schedule) {
        return api.updateNotificationSchedule(schedule.id, payload)
      }
      return api.createNotificationSchedule(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notificationSchedules })
      toast.success(
        isEdit
          ? t("notifications.schedules.toastUpdated")
          : t("notifications.schedules.toastCreated")
      )
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const toggleChannel = (id: number) => {
    setChannelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-border px-6 pt-5 pb-4">
          <DialogTitle>
            {isEdit
              ? t("notifications.schedules.editTitle")
              : t("notifications.schedules.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("notifications.schedules.formDesc")}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="sc-name">{t("notifications.schedules.name")}</Label>
            <Input
              id="sc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("notifications.schedules.namePlaceholder")}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("notifications.schedules.frequency")}</Label>
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency((v as "daily" | "weekly" | "monthly") || "daily")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">{t("notifications.schedules.freqDaily")}</SelectItem>
                  <SelectItem value="weekly">{t("notifications.schedules.freqWeekly")}</SelectItem>
                  <SelectItem value="monthly">{t("notifications.schedules.freqMonthly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sc-time">{t("notifications.schedules.timeOfDay")}</Label>
              <Input
                id="sc-time"
                type="time"
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {frequency === "weekly" && (
              <div className="space-y-1.5">
                <Label>{t("notifications.schedules.weekday")}</Label>
                <Select value={String(weekday)} onValueChange={(v) => setWeekday(Number(v ?? 1))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {t(`notifications.weekdays.${d}` as "notifications.weekdays.1")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {frequency === "monthly" && (
              <div className="space-y-1.5">
                <Label htmlFor="sc-dom">{t("notifications.schedules.dayOfMonth")}</Label>
                <Input
                  id="sc-dom"
                  type="number"
                  min={1}
                  max={31}
                  value={dayOfMonth}
                  onChange={(e) =>
                    setDayOfMonth(Math.min(31, Math.max(1, Number(e.target.value) || 1)))
                  }
                  className="tabular-nums"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{t("notifications.schedules.timezone")}</Label>
              <Select value={timezone} onValueChange={(v) => setTimezone(v || "Asia/Shanghai")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3.5">
            <div className="text-xs font-medium text-foreground">
              {t("notifications.schedules.contentTitle")}
            </div>

            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox checked={includeSummary} onCheckedChange={setIncludeSummary} />
                <span>{t("notifications.schedules.includeSummary")}</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox checked={includeNodeTraffic} onCheckedChange={setIncludeNodeTraffic} />
                <span>{t("notifications.schedules.includeNodeTraffic")}</span>
              </label>

              {includeNodeTraffic && (
                <div className="grid gap-3 pl-6 pt-1 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      {t("notifications.schedules.trafficMode")}
                    </Label>
                    <Select
                      value={trafficMode}
                      onValueChange={(v) =>
                        setTrafficMode((v as "used" | "remaining") || "used")
                      }
                    >
                      <SelectTrigger size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="used">
                          {t("notifications.schedules.trafficModeUsed")}
                        </SelectItem>
                        <SelectItem value="remaining">
                          {t("notifications.schedules.trafficModeRemaining")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="sc-node-limit" className="text-[11px] text-muted-foreground">
                      {t("notifications.schedules.nodeLimit")}
                    </Label>
                    <Input
                      id="sc-node-limit"
                      type="number"
                      min={0}
                      max={100}
                      value={nodeLimit}
                      onChange={(e) => setNodeLimit(Math.max(0, Number(e.target.value) || 0))}
                      className="h-8 text-xs tabular-nums"
                    />
                  </div>
                </div>
              )}

              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox checked={includeExpiring} onCheckedChange={setIncludeExpiring} />
                <span>{t("notifications.schedules.includeExpiring")}</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox checked={includeTopUsers} onCheckedChange={setIncludeTopUsers} />
                <span>{t("notifications.schedules.includeTopUsers")}</span>
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>{t("notifications.schedules.targetChannels")}</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {t("notifications.schedules.allEnabledChannels")}
                </span>
                <Switch checked={allChannels} onCheckedChange={setAllChannels} />
              </div>
            </div>
            {!allChannels && (
              <div className="space-y-1.5 rounded-md border border-border bg-muted/20 p-3">
                {channels.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("notifications.schedules.noChannelsHint")}
                  </p>
                ) : (
                  channels.map((ch) => (
                    <label key={ch.id} className="flex cursor-pointer items-center gap-2 text-xs">
                      <Checkbox
                        checked={channelIds.includes(ch.id)}
                        onCheckedChange={() => toggleChannel(ch.id)}
                      />
                      <span className="truncate">{ch.name}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <span className="text-xs font-medium">{t("notifications.schedules.enabledLabel")}</span>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border px-6 py-3.5">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
