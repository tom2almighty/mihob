import { useEffect, useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Loader2, Send } from "lucide-react"
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
import type { NotificationChannel, NotificationProvider } from "@/lib/types"
import {
  ALERT_EVENT_TYPES,
  buildBarkUrl,
  buildDiscordUrl,
  buildGenericUrl,
  buildSmtpUrl,
  buildTelegramUrl,
  CHANNEL_PROVIDERS,
  parseDiscordWebhookUrl,
  type BarkWizard,
  type DiscordWizard,
  type GenericWizard,
  type SmtpWizard,
  type TelegramWizard,
} from "./constants"

const DEFAULT_TG: TelegramWizard = { token: "", chats: "", parseMode: "None" }
const DEFAULT_BARK: BarkWizard = { key: "", host: "api.day.app", group: "mihob", sound: "" }
const DEFAULT_DISCORD: DiscordWizard = { webhookUrl: "", webhookId: "", token: "" }
const DEFAULT_GENERIC: GenericWizard = {
  url: "",
  template: "json",
  method: "POST",
  titleKey: "",
  messageKey: "",
}
const DEFAULT_SMTP: SmtpWizard = {
  host: "",
  port: "587",
  username: "",
  password: "",
  from: "",
  to: "",
  encryption: "Auto",
}

export function ChannelFormDialog({
  open,
  onOpenChange,
  channel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  channel: NotificationChannel | null
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const isEdit = Boolean(channel)

  const [name, setName] = useState("")
  const [provider, setProvider] = useState<NotificationProvider>("telegram")
  const [enabled, setEnabled] = useState(true)
  const [remark, setRemark] = useState("")
  const [allEvents, setAllEvents] = useState(true)
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])
  const [rawUrl, setRawUrl] = useState("")

  const [tg, setTg] = useState<TelegramWizard>(DEFAULT_TG)
  const [bark, setBark] = useState<BarkWizard>(DEFAULT_BARK)
  const [discord, setDiscord] = useState<DiscordWizard>(DEFAULT_DISCORD)
  const [generic, setGeneric] = useState<GenericWizard>(DEFAULT_GENERIC)
  const [smtp, setSmtp] = useState<SmtpWizard>(DEFAULT_SMTP)

  useEffect(() => {
    if (!open) return
    if (channel) {
      setName(channel.name)
      const validProvider = CHANNEL_PROVIDERS.some((p) => p.id === channel.provider)
        ? (channel.provider as NotificationProvider)
        : "custom"
      setProvider(validProvider)
      setEnabled(channel.enabled)
      setRemark(channel.remark || "")
      const evs = channel.events ?? []
      setAllEvents(evs.length === 0)
      setSelectedEvents(evs)
      setRawUrl("")
    } else {
      setName("")
      setProvider("telegram")
      setEnabled(true)
      setRemark("")
      setAllEvents(true)
      setSelectedEvents([])
      setRawUrl("")
    }
    setTg(DEFAULT_TG)
    setBark(DEFAULT_BARK)
    setDiscord(DEFAULT_DISCORD)
    setGeneric(DEFAULT_GENERIC)
    setSmtp(DEFAULT_SMTP)
  }, [open, channel])

  const builtUrl = useMemo(() => {
    switch (provider) {
      case "telegram":
        return buildTelegramUrl(tg)
      case "bark":
        return buildBarkUrl(bark)
      case "discord":
        return buildDiscordUrl(discord)
      case "generic":
        return buildGenericUrl(generic)
      case "smtp":
        return buildSmtpUrl(smtp)
      case "custom":
      default:
        return rawUrl.trim()
    }
  }, [provider, tg, bark, discord, generic, smtp, rawUrl])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) {
        throw new Error(t("notifications.channels.validation.nameRequired"))
      }
      if (!isEdit && !builtUrl) {
        throw new Error(t("notifications.channels.validation.urlRequired"))
      }
      const payload: Record<string, unknown> = {
        name: name.trim(),
        provider,
        enabled,
        events: allEvents ? [] : selectedEvents,
        remark: remark.trim(),
      }
      if (builtUrl) {
        payload.url = builtUrl
      }
      if (isEdit && channel) {
        return api.updateNotificationChannel(channel.id, payload)
      }
      return api.createNotificationChannel(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notificationChannels })
      toast.success(
        isEdit ? t("notifications.channels.toastUpdated") : t("notifications.channels.toastCreated")
      )
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const testMutation = useMutation({
    mutationFn: async () => {
      if (builtUrl) {
        return api.testNotificationUrl(builtUrl)
      }
      if (isEdit && channel) {
        return api.testNotificationChannel(channel.id)
      }
      throw new Error(t("notifications.channels.validation.urlRequired"))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notificationLogs })
      toast.success(t("notifications.channels.toastTestSuccess"))
    },
    onError: (err: Error) => {
      qc.invalidateQueries({ queryKey: queryKeys.notificationLogs })
      toast.error(err.message)
    },
  })

  const toggleEvent = (ev: string) => {
    setSelectedEvents((prev) =>
      prev.includes(ev) ? prev.filter((item) => item !== ev) : [...prev, ev]
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 pt-5 pb-4">
          <DialogTitle>
            {isEdit
              ? t("notifications.channels.editTitle")
              : t("notifications.channels.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("notifications.channels.formDesc")}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          <div className="grid gap-4 sm:grid-cols-12">
            <div className="space-y-1.5 sm:col-span-5">
              <Label htmlFor="ch-name">{t("notifications.channels.name")}</Label>
              <Input
                id="ch-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("notifications.channels.namePlaceholder")}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-4">
              <Label>{t("notifications.channels.provider")}</Label>
              <Select
                value={provider}
                onValueChange={(v) => setProvider((v as NotificationProvider) || "telegram")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {t(p.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="ch-enabled">{t("notifications.channels.enabledLabel")}</Label>
              <div className="flex h-8 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 dark:bg-input/30">
                <span
                  className={
                    enabled
                      ? "truncate text-xs font-medium text-success"
                      : "truncate text-xs text-muted-foreground"
                  }
                >
                  {enabled ? t("common.enabled") : t("common.disabled")}
                </span>
                <Switch
                  id="ch-enabled"
                  size="sm"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                />
              </div>
            </div>
          </div>

          {isEdit && channel?.masked_url && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
              <div className="text-muted-foreground">
                {t("notifications.channels.currentUrlHint")}
              </div>
              <div className="mt-0.5 truncate font-mono text-foreground">{channel.masked_url}</div>
            </div>
          )}

          {/* Provider Wizard Fields */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
            {provider === "telegram" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="tg-token">{t("notifications.wizard.tgToken")}</Label>
                  <Input
                    id="tg-token"
                    type="password"
                    value={tg.token}
                    onChange={(e) => setTg((s) => ({ ...s, token: e.target.value }))}
                    placeholder="123456789:ABCdefGHIjklMNO..."
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="tg-chats">{t("notifications.wizard.tgChats")}</Label>
                    <Input
                      id="tg-chats"
                      value={tg.chats}
                      onChange={(e) => setTg((s) => ({ ...s, chats: e.target.value }))}
                      placeholder="-1001234567890"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {t("notifications.wizard.tgChatsHint")}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("notifications.wizard.tgParseMode")}</Label>
                    <Select
                      value={tg.parseMode}
                      onValueChange={(v) => setTg((s) => ({ ...s, parseMode: v || "None" }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="None">{t("notifications.wizard.plainText")}</SelectItem>
                        <SelectItem value="Markdown">Markdown</SelectItem>
                        <SelectItem value="HTML">HTML</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            {provider === "bark" && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="bark-key">{t("notifications.wizard.barkKey")}</Label>
                    <Input
                      id="bark-key"
                      type="password"
                      value={bark.key}
                      onChange={(e) => setBark((s) => ({ ...s, key: e.target.value }))}
                      placeholder="your-device-key"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bark-host">{t("notifications.wizard.barkHost")}</Label>
                    <Input
                      id="bark-host"
                      value={bark.host}
                      onChange={(e) => setBark((s) => ({ ...s, host: e.target.value }))}
                      placeholder="api.day.app"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="bark-group">{t("notifications.wizard.barkGroup")}</Label>
                    <Input
                      id="bark-group"
                      value={bark.group}
                      onChange={(e) => setBark((s) => ({ ...s, group: e.target.value }))}
                      placeholder="mihob"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bark-sound">{t("notifications.wizard.barkSound")}</Label>
                    <Input
                      id="bark-sound"
                      value={bark.sound}
                      onChange={(e) => setBark((s) => ({ ...s, sound: e.target.value }))}
                      placeholder={t("common.optional")}
                    />
                  </div>
                </div>
              </>
            )}

            {provider === "discord" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="dc-webhook">{t("notifications.wizard.discordWebhookUrl")}</Label>
                  <Input
                    id="dc-webhook"
                    type="password"
                    value={discord.webhookUrl}
                    onChange={(e) => {
                      const val = e.target.value
                      const parsed = parseDiscordWebhookUrl(val)
                      setDiscord((s) => ({
                        ...s,
                        webhookUrl: val,
                        webhookId: parsed ? parsed.id : s.webhookId,
                        token: parsed ? parsed.token : s.token,
                      }))
                    }}
                    placeholder="https://discord.com/api/webhooks/ID/TOKEN"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t("notifications.wizard.discordWebhookHint")}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="dc-id">{t("notifications.wizard.discordId")}</Label>
                    <Input
                      id="dc-id"
                      value={discord.webhookId}
                      onChange={(e) => setDiscord((s) => ({ ...s, webhookId: e.target.value }))}
                      placeholder="123456789012345678"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dc-token">{t("notifications.wizard.discordToken")}</Label>
                    <Input
                      id="dc-token"
                      type="password"
                      value={discord.token}
                      onChange={(e) => setDiscord((s) => ({ ...s, token: e.target.value }))}
                      placeholder="webhook-token"
                    />
                  </div>
                </div>
              </>
            )}

            {provider === "generic" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="gen-url">{t("notifications.wizard.genericUrl")}</Label>
                  <Input
                    id="gen-url"
                    value={generic.url}
                    onChange={(e) => setGeneric((s) => ({ ...s, url: e.target.value }))}
                    placeholder="https://hooks.example.com/notify"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{t("notifications.wizard.genericTemplate")}</Label>
                    <Select
                      value={generic.template}
                      onValueChange={(v) =>
                        setGeneric((s) => ({ ...s, template: (v as "json" | "empty") || "json" }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="json">JSON</SelectItem>
                        <SelectItem value="empty">{t("notifications.wizard.plainText")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("notifications.wizard.genericMethod")}</Label>
                    <Select
                      value={generic.method}
                      onValueChange={(v) =>
                        setGeneric((s) => ({ ...s, method: (v as "POST" | "PUT") || "POST" }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="PUT">PUT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {generic.template === "json" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="gen-title-key">{t("notifications.wizard.genericTitleKey")}</Label>
                      <Input
                        id="gen-title-key"
                        value={generic.titleKey}
                        onChange={(e) => setGeneric((s) => ({ ...s, titleKey: e.target.value }))}
                        placeholder="title"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="gen-msg-key">{t("notifications.wizard.genericMsgKey")}</Label>
                      <Input
                        id="gen-msg-key"
                        value={generic.messageKey}
                        onChange={(e) => setGeneric((s) => ({ ...s, messageKey: e.target.value }))}
                        placeholder="message"
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {provider === "smtp" && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="smtp-host">{t("notifications.wizard.smtpHost")}</Label>
                    <Input
                      id="smtp-host"
                      value={smtp.host}
                      onChange={(e) => setSmtp((s) => ({ ...s, host: e.target.value }))}
                      placeholder="smtp.example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-port">{t("notifications.wizard.smtpPort")}</Label>
                    <Input
                      id="smtp-port"
                      value={smtp.port}
                      onChange={(e) => setSmtp((s) => ({ ...s, port: e.target.value }))}
                      placeholder="587"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-user">{t("notifications.wizard.smtpUser")}</Label>
                    <Input
                      id="smtp-user"
                      value={smtp.username}
                      onChange={(e) => setSmtp((s) => ({ ...s, username: e.target.value }))}
                      placeholder="bot@example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-pass">{t("notifications.wizard.smtpPass")}</Label>
                    <Input
                      id="smtp-pass"
                      type="password"
                      value={smtp.password}
                      onChange={(e) => setSmtp((s) => ({ ...s, password: e.target.value }))}
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-from">{t("notifications.wizard.smtpFrom")}</Label>
                    <Input
                      id="smtp-from"
                      value={smtp.from}
                      onChange={(e) => setSmtp((s) => ({ ...s, from: e.target.value }))}
                      placeholder="mihob@example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-to">{t("notifications.wizard.smtpTo")}</Label>
                    <Input
                      id="smtp-to"
                      value={smtp.to}
                      onChange={(e) => setSmtp((s) => ({ ...s, to: e.target.value }))}
                      placeholder="admin@example.com"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("notifications.wizard.smtpEncryption")}</Label>
                  <Select
                    value={smtp.encryption}
                    onValueChange={(v) =>
                      setSmtp((s) => ({
                        ...s,
                        encryption: (v as SmtpWizard["encryption"]) || "Auto",
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Auto">Auto (STARTTLS)</SelectItem>
                      <SelectItem value="ExplicitTLS">ExplicitTLS</SelectItem>
                      <SelectItem value="ImplicitTLS">ImplicitTLS (SSL 465)</SelectItem>
                      <SelectItem value="None">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {provider === "custom" && (
              <div className="space-y-1.5">
                <Label htmlFor="custom-url">{t("notifications.wizard.customUrl")}</Label>
                <Input
                  id="custom-url"
                  value={rawUrl}
                  onChange={(e) => setRawUrl(e.target.value)}
                  placeholder={t("notifications.wizard.customUrlPlaceholder")}
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  {t("notifications.wizard.customUrlHint")}
                </p>
              </div>
            )}

            {provider !== "custom" && builtUrl && (
              <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px]">
                <span className="text-muted-foreground">Shoutrrr URL: </span>
                <span className="break-all font-mono text-foreground">{builtUrl}</span>
              </div>
            )}
          </div>

          {/* Event Scope */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label>{t("notifications.channels.eventScope")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("notifications.channels.eventScopeDesc")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {t("notifications.channels.receiveAllEvents")}
                </span>
                <Switch checked={allEvents} onCheckedChange={setAllEvents} />
              </div>
            </div>

            {!allEvents && (
              <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/20 p-3">
                {ALERT_EVENT_TYPES.map((ev) => {
                  const checked = selectedEvents.includes(ev)
                  return (
                    <label
                      key={ev}
                      className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleEvent(ev)} />
                      <span className="truncate">
                        {t(`notifications.events.${ev}` as "notifications.events.node_offline")}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ch-remark">{t("notifications.channels.remark")}</Label>
            <Input
              id="ch-remark"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder={t("common.optional")}
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-6 py-3.5 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={testMutation.isPending || (!builtUrl && !isEdit)}
            onClick={() => testMutation.mutate()}
          >
            {testMutation.isPending ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Send className="mr-1.5 size-3.5" />
            )}
            {t("notifications.channels.sendTest")}
          </Button>
          <div className="flex items-center gap-2">
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
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
