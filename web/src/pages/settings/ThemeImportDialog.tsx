import { useEffect, useMemo, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { AlertCircle, CheckCircle2, Code2, Download, Link2, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import {
  exportThemeAsCSS,
  extractThemeUrlFromInput,
  getThemePreviewColors,
  parseThemeInput,
  slugifyThemeId,
} from "@/lib/theme-engine"
import type { CustomTheme } from "@/lib/types"

interface ThemeImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingTheme: CustomTheme | null
  saving: boolean
  onSubmit: (theme: CustomTheme, activateImmediately: boolean) => void
}

function MiniThemeMockup({
  theme,
  mode,
  label,
}: {
  theme: CustomTheme
  mode: "light" | "dark"
  label: string
}) {
  const c = getThemePreviewColors(theme, mode)
  const radius = c.radius

  return (
    <div
      className="space-y-2 border p-3"
      style={{
        backgroundColor: c.background,
        borderColor: c.border,
        color: c.foreground,
        borderRadius: radius,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium" style={{ color: c.foreground }}>
          {label}
        </span>
        <div className="flex items-center gap-1">
          {[c.primary, c.secondary, c.accent].map((swatch, idx) => (
            <span
              key={idx}
              className="size-2.5 rounded-full border"
              style={{ backgroundColor: swatch, borderColor: c.border }}
            />
          ))}
        </div>
      </div>
      <div
        className="space-y-2 border p-2.5"
        style={{
          backgroundColor: c.card,
          borderColor: c.border,
          borderRadius: `calc(${radius} * 0.8)`,
        }}
      >
        <div
          className="h-2 w-2/3 rounded-full opacity-80"
          style={{ backgroundColor: c.foreground }}
        />
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-4 w-12"
            style={{
              backgroundColor: c.primary,
              borderRadius: `calc(${radius} * 0.5)`,
            }}
          />
          <span
            className="inline-block h-4 w-10"
            style={{
              backgroundColor: c.secondary,
              borderRadius: `calc(${radius} * 0.5)`,
            }}
          />
        </div>
      </div>
    </div>
  )
}

export function ThemeImportDialog({
  open,
  onOpenChange,
  editingTheme,
  saving,
  onSubmit,
}: ThemeImportDialogProps) {
  const { t } = useTranslation()
  const [importTab, setImportTab] = useState<"code" | "url">("code")
  const [name, setName] = useState("")
  const [rawInput, setRawInput] = useState("")
  const [urlInput, setUrlInput] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")
  const [activateNow, setActivateNow] = useState(true)

  useEffect(() => {
    if (!open) return
    if (editingTheme) {
      setName(editingTheme.name)
      setRawInput(exportThemeAsCSS(editingTheme))
      setUrlInput(editingTheme.source_url || "")
      setSourceUrl(editingTheme.source_url || "")
      setImportTab("code")
      setActivateNow(false)
    } else {
      setName("")
      setRawInput("")
      setUrlInput("")
      setSourceUrl("")
      setImportTab("code")
      setActivateNow(true)
    }
  }, [open, editingTheme])

  const fetchMutation = useMutation({
    mutationFn: (url: string) => api.fetchThemeUrl(url),
    onSuccess: (res) => {
      setRawInput(res.content)
      setSourceUrl(res.url)
      try {
        const parsed = parseThemeInput(res.content)
        if (!name.trim() && parsed.suggestedName) {
          setName(parsed.suggestedName)
        }
        toast.success(t("settings.appearance.fetchSuccess"))
      } catch {
        toast.error(t("settings.appearance.parseErrorNoVars"))
      }
      setImportTab("code")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const parseState = useMemo(() => {
    if (!rawInput.trim()) return { status: "empty" as const }
    try {
      const parsed = parseThemeInput(rawInput)
      return { status: "ok" as const, parsed }
    } catch (err) {
      const code = err instanceof Error ? err.message : "UNKNOWN"
      return { status: "error" as const, code }
    }
  }, [rawInput])

  const previewTheme = useMemo<CustomTheme | null>(() => {
    if (parseState.status !== "ok") return null
    return {
      id: editingTheme?.id || "preview",
      name: name.trim() || parseState.parsed.suggestedName || t("settings.appearance.untitled"),
      source_url: sourceUrl || undefined,
      theme: Object.keys(parseState.parsed.theme).length > 0 ? parseState.parsed.theme : undefined,
      light: parseState.parsed.light,
      dark: parseState.parsed.dark,
    }
  }, [parseState, editingTheme?.id, name, sourceUrl, t])

  const handleFetchUrl = () => {
    const extracted = extractThemeUrlFromInput(urlInput)
    if (!extracted) {
      toast.error(t("settings.appearance.invalidUrl"))
      return
    }
    fetchMutation.mutate(extracted)
  }

  const handleSave = () => {
    if (parseState.status !== "ok") {
      toast.error(t("settings.appearance.parseErrorNoVars"))
      return
    }
    const finalName = (name.trim() || parseState.parsed.suggestedName || "").trim()
    if (!finalName) {
      toast.error(t("settings.appearance.nameRequired"))
      return
    }
    const nowIso = new Date().toISOString()
    const nextTheme: CustomTheme = {
      id: editingTheme?.id || slugifyThemeId(finalName),
      name: finalName,
      source_url: sourceUrl.trim() || undefined,
      theme: Object.keys(parseState.parsed.theme).length > 0 ? parseState.parsed.theme : undefined,
      light: parseState.parsed.light,
      dark: parseState.parsed.dark,
      created_at: editingTheme?.created_at || nowIso,
      updated_at: nowIso,
    }
    onSubmit(nextTheme, activateNow)
  }

  const lightCount = parseState.status === "ok" ? Object.keys(parseState.parsed.light).length : 0
  const darkCount = parseState.status === "ok" ? Object.keys(parseState.parsed.dark).length : 0
  const radiusVal =
    parseState.status === "ok"
      ? parseState.parsed.light.radius || parseState.parsed.theme.radius
      : undefined
  const fontVal =
    parseState.status === "ok"
      ? (parseState.parsed.light["font-sans"] || parseState.parsed.theme["font-sans"])
          ?.split(",")[0]
          ?.replace(/["']/g, "")
          .trim()
      : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>
            {editingTheme
              ? t("settings.appearance.editDialogTitle")
              : t("settings.appearance.addDialogTitle")}
          </DialogTitle>
          <DialogDescription>{t("settings.appearance.dialogDesc")}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="theme-name-input">{t("settings.appearance.themeName")}</Label>
            <Input
              id="theme-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("settings.appearance.themeNamePlaceholder")}
              maxLength={80}
            />
          </div>

          <Tabs value={importTab} onValueChange={(v) => setImportTab(v as "code" | "url")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="code" className="gap-1.5 text-xs sm:text-sm">
                <Code2 className="size-3.5" />
                {t("settings.appearance.tabCode")}
              </TabsTrigger>
              <TabsTrigger value="url" className="gap-1.5 text-xs sm:text-sm">
                <Link2 className="size-3.5" />
                {t("settings.appearance.tabUrl")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="code" className="mt-3 space-y-2">
              <Label htmlFor="theme-code-input">{t("settings.appearance.codeLabel")}</Label>
              <Textarea
                id="theme-code-input"
                value={rawInput}
                onChange={(e) => {
                  const next = e.target.value
                  setRawInput(next)
                  if (!name.trim() && next.trim().startsWith("{")) {
                    try {
                      const p = parseThemeInput(next)
                      if (p.suggestedName) setName(p.suggestedName)
                    } catch {
                      // ignore while typing
                    }
                  }
                }}
                placeholder={t("settings.appearance.codePlaceholder")}
                className="h-44 resize-none font-mono text-xs leading-relaxed"
              />
              <p className="text-xs text-muted-foreground">{t("settings.appearance.codeHint")}</p>
            </TabsContent>

            <TabsContent value="url" className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="theme-url-input">{t("settings.appearance.urlLabel")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="theme-url-input"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://tweakcn.com/r/themes/claude.json"
                    className="font-mono text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleFetchUrl()
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleFetchUrl}
                    disabled={fetchMutation.isPending || !urlInput.trim()}
                    className="shrink-0"
                  >
                    {fetchMutation.isPending ? (
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    ) : (
                      <Download className="mr-1.5 size-3.5" />
                    )}
                    {t("settings.appearance.fetchBtn")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t("settings.appearance.urlHint")}</p>
              </div>
            </TabsContent>
          </Tabs>

          {/* Live parse feedback + preview */}
          {parseState.status === "error" && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>
                {parseState.code === "INVALID_JSON"
                  ? t("settings.appearance.parseErrorJson")
                  : t("settings.appearance.parseErrorNoVars")}
              </span>
            </div>
          )}

          {parseState.status === "ok" && previewTheme && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/25 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <CheckCircle2 className="size-3.5 text-success" />
                  {t("settings.appearance.parseSuccess")}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="text-[11px] font-normal tabular-nums">
                    {t("settings.appearance.tokensSummary", {
                      light: lightCount,
                      dark: darkCount,
                    })}
                  </Badge>
                  {radiusVal && (
                    <Badge variant="outline" className="font-mono text-[11px] font-normal">
                      radius: {radiusVal}
                    </Badge>
                  )}
                  {fontVal && (
                    <Badge variant="outline" className="max-w-36 truncate text-[11px] font-normal">
                      {fontVal}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MiniThemeMockup theme={previewTheme} mode="light" label={t("nav.themeLight")} />
                <MiniThemeMockup theme={previewTheme} mode="dark" label={t("nav.themeDark")} />
              </div>
            </div>
          )}

          {!editingTheme && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
              <Checkbox
                checked={activateNow}
                onCheckedChange={(checked) => setActivateNow(Boolean(checked))}
              />
              <Sparkles className="size-3.5 text-muted-foreground" />
              <span>{t("settings.appearance.activateImmediately")}</span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving || parseState.status !== "ok"}
          >
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {editingTheme ? t("common.save") : t("settings.appearance.saveTheme")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
