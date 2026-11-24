import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Check, Copy, ExternalLink, Palette, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ErrorState } from "@/components/common/CommonUI"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, queryKeys } from "@/lib/api"
import { useTheme } from "@/lib/theme"
import { exportThemeAsCSS, getThemePreviewColors } from "@/lib/theme-engine"
import { BUILTIN_THEME_PRESETS, type ThemePreset } from "@/lib/theme-presets"
import type { CustomTheme, ThemeConfig } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ThemeImportDialog } from "./ThemeImportDialog"

function ThemePresetCard({
  themeItem,
  builtin,
  active,
  resolvedMode,
  disabled,
  onSelect,
  onCopyCss,
  onEdit,
  onDelete,
}: {
  themeItem: CustomTheme | ThemePreset
  builtin: boolean
  active: boolean
  resolvedMode: "light" | "dark"
  disabled: boolean
  onSelect: () => void
  onCopyCss?: () => void
  onEdit?: () => void
  onDelete?: () => void
}) {
  const { t } = useTranslation()
  const preview =
    "previewLight" in themeItem
      ? resolvedMode === "dark"
        ? { ...themeItem.previewDark, radius: themeItem.theme?.radius || "0.625rem" }
        : { ...themeItem.previewLight, radius: themeItem.theme?.radius || "0.625rem" }
      : getThemePreviewColors(themeItem, resolvedMode)

  const fontLabel = (themeItem.light["font-sans"] || themeItem.theme?.["font-sans"] || "")
    .split(",")[0]
    ?.replace(/["']/g, "")
    .trim()

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-lg border bg-card transition-all",
        active
          ? "border-primary ring-2 ring-primary/25"
          : "border-border hover:border-foreground/25"
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className="flex flex-1 flex-col gap-2.5 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-t-lg disabled:pointer-events-none disabled:opacity-60"
      >
        {/* Miniature Theme Preview */}
        <div
          className="w-full space-y-2 border p-2.5"
          style={{
            backgroundColor: preview.background,
            borderColor: preview.border,
            borderRadius: preview.radius,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className="size-3 rounded-full border"
                style={{ backgroundColor: preview.primary, borderColor: preview.border }}
              />
              <span
                className="size-3 rounded-full border"
                style={{ backgroundColor: preview.secondary, borderColor: preview.border }}
              />
              <span
                className="size-3 rounded-full border"
                style={{ backgroundColor: preview.accent, borderColor: preview.border }}
              />
            </div>
            {active && (
              <span
                className="flex size-4 items-center justify-center rounded-full"
                style={{ backgroundColor: preview.primary, color: preview.background }}
              >
                <Check className="size-2.5 stroke-3" />
              </span>
            )}
          </div>

          <div
            className="flex items-center justify-between gap-2 border px-2 py-1.5"
            style={{
              backgroundColor: preview.card,
              borderColor: preview.border,
              borderRadius: `calc(${preview.radius} * 0.75)`,
            }}
          >
            <div className="space-y-1 flex-1">
              <div
                className="h-1.5 w-3/4 rounded-full opacity-80"
                style={{ backgroundColor: preview.foreground }}
              />
              <div
                className="h-1.5 w-1/2 rounded-full opacity-35"
                style={{ backgroundColor: preview.foreground }}
              />
            </div>
            <span
              className="h-4 w-8 shrink-0"
              style={{
                backgroundColor: preview.primary,
                borderRadius: `calc(${preview.radius} * 0.5)`,
              }}
            />
          </div>
        </div>

        {/* Metadata */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{themeItem.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {fontLabel ? `${fontLabel} · ` : ""}
              {preview.radius}
            </div>
          </div>
          {builtin ? (
            <Badge variant="secondary" className="shrink-0 text-[10px] font-normal">
              {t("settings.appearance.builtinBadge")}
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
              {t("settings.appearance.customBadge")}
            </Badge>
          )}
        </div>
      </button>

      {!builtin && (
        <div className="flex items-center justify-end gap-0.5 border-t border-border px-2 py-1">
          {onCopyCss && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={onCopyCss}
                    aria-label={t("settings.appearance.copyCssAria")}
                    className="size-7 text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent>{t("settings.appearance.copyCssTooltip")}</TooltipContent>
            </Tooltip>
          )}
          {onEdit && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={onEdit}
                    aria-label={t("settings.appearance.editThemeAria")}
                    className="size-7 text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent>{t("common.edit")}</TooltipContent>
            </Tooltip>
          )}
          {onDelete && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={onDelete}
                    aria-label={t("settings.appearance.deleteThemeAria")}
                    className="size-7 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent>{t("common.delete")}</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  )
}

export function AppearanceTab() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { resolvedMode, activeThemeId, applyActiveTheme } = useTheme()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTheme, setEditingTheme] = useState<CustomTheme | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CustomTheme | null>(null)

  const themesQuery = useQuery({
    queryKey: queryKeys.themes,
    queryFn: api.getThemes,
  })

  const customThemes = themesQuery.data?.custom_themes ?? []
  const currentActiveId = themesQuery.data?.active_theme_id || activeThemeId

  const saveMutation = useMutation({
    mutationFn: (nextCfg: ThemeConfig) => api.updateThemes(nextCfg),
    onSuccess: (saved) => {
      qc.setQueryData(queryKeys.themes, saved)
      const matchedCustom =
        saved.custom_themes.find((item) => item.id === saved.active_theme_id) ?? null
      applyActiveTheme(saved.active_theme_id, matchedCustom)
      qc.invalidateQueries({ queryKey: queryKeys.publicTheme })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleSelectTheme = (id: string) => {
    if (id === currentActiveId) return
    const nextCfg: ThemeConfig = {
      active_theme_id: id,
      custom_themes: customThemes,
    }
    saveMutation.mutate(nextCfg, {
      onSuccess: () => toast.success(t("settings.appearance.toastSwitched")),
    })
  }

  const handleSaveCustomTheme = (item: CustomTheme, activateImmediately: boolean) => {
    const exists = customThemes.some((ct) => ct.id === item.id)
    const nextList = exists
      ? customThemes.map((ct) => (ct.id === item.id ? item : ct))
      : [...customThemes, item]
    const nextActiveId = activateImmediately ? item.id : currentActiveId
    saveMutation.mutate(
      { active_theme_id: nextActiveId, custom_themes: nextList },
      {
        onSuccess: () => {
          setDialogOpen(false)
          setEditingTheme(null)
          toast.success(
            exists ? t("settings.appearance.toastUpdated") : t("settings.appearance.toastAdded")
          )
        },
      }
    )
  }

  const handleConfirmDelete = () => {
    if (!deleteTarget) return
    const targetId = deleteTarget.id
    const nextList = customThemes.filter((ct) => ct.id !== targetId)
    const nextActiveId = currentActiveId === targetId ? "default" : currentActiveId
    saveMutation.mutate(
      { active_theme_id: nextActiveId, custom_themes: nextList },
      {
        onSuccess: () => {
          setDeleteTarget(null)
          toast.success(t("settings.appearance.toastDeleted"))
        },
      }
    )
  }

  const handleCopyCss = async (item: CustomTheme) => {
    try {
      await navigator.clipboard.writeText(exportThemeAsCSS(item))
      toast.success(t("common.copySuccess"))
    } catch {
      toast.error(t("common.copyError"))
    }
  }

  return (
    <div className="space-y-4">
      {/* Theme Presets & Custom tweakcn Themes Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Palette className="size-4 text-muted-foreground" />
                {t("settings.appearance.themeCardTitle")}
              </CardTitle>
              <CardDescription>{t("settings.appearance.themeCardDesc")}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {currentActiveId !== "default" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={saveMutation.isPending}
                  onClick={() => handleSelectTheme("default")}
                >
                  <RotateCcw className="mr-1.5 size-3.5" />
                  {t("settings.appearance.resetDefault")}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                render={
                  <a href="https://tweakcn.com/editor/theme" target="_blank" rel="noreferrer" />
                }
                nativeButton={false}
              >
                {t("settings.appearance.openTweakcn")}
                <ExternalLink className="ml-1 size-3 text-muted-foreground" />
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setEditingTheme(null)
                  setDialogOpen(true)
                }}
              >
                <Plus className="mr-1.5 size-3.5" />
                {t("settings.appearance.addTheme")}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {themesQuery.isError ? (
            <ErrorState message={themesQuery.error.message} onRetry={() => themesQuery.refetch()} />
          ) : themesQuery.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <Skeleton key={n} className="h-32 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-2.5">
                <div className="text-xs font-medium text-muted-foreground">
                  {t("settings.appearance.builtinSection")}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {BUILTIN_THEME_PRESETS.map((preset) => (
                    <ThemePresetCard
                      key={preset.id}
                      themeItem={preset}
                      builtin
                      active={currentActiveId === preset.id}
                      resolvedMode={resolvedMode}
                      disabled={saveMutation.isPending}
                      onSelect={() => handleSelectTheme(preset.id)}
                    />
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("settings.appearance.customSection", { count: customThemes.length })}
                  </span>
                </div>

                {customThemes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
                    <Palette className="mb-2 size-5 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">
                      {t("settings.appearance.customEmptyTitle")}
                    </p>
                    <p className="mt-1 max-w-md text-xs text-muted-foreground">
                      {t("settings.appearance.customEmptyDesc")}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => {
                        setEditingTheme(null)
                        setDialogOpen(true)
                      }}
                    >
                      <Plus className="mr-1.5 size-3.5" />
                      {t("settings.appearance.addTheme")}
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {customThemes.map((item) => (
                      <ThemePresetCard
                        key={item.id}
                        themeItem={item}
                        builtin={false}
                        active={currentActiveId === item.id}
                        resolvedMode={resolvedMode}
                        disabled={saveMutation.isPending}
                        onSelect={() => handleSelectTheme(item.id)}
                        onCopyCss={() => void handleCopyCss(item)}
                        onEdit={() => {
                          setEditingTheme(item)
                          setDialogOpen(true)
                        }}
                        onDelete={() => setDeleteTarget(item)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ThemeImportDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingTheme(null)
        }}
        editingTheme={editingTheme}
        saving={saveMutation.isPending}
        onSubmit={handleSaveCustomTheme}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.appearance.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.appearance.deleteDesc", { name: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saveMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={saveMutation.isPending}
              onClick={handleConfirmDelete}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
