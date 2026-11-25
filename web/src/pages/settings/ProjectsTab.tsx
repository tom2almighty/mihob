import { useTranslation } from "react-i18next"
import { BookOpen, ExternalLink } from "lucide-react"
import { siGithub } from "simple-icons"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

function SimpleIconSvg({ path, className = "size-4" }: { path: string; className?: string }) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  )
}

export function ProjectsTab() {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">
          {t("settings.projectsCardTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("settings.projectsCardDesc")}</p>
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-card p-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground">
                <SimpleIconSvg path={siGithub.path} className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">mihob</div>
                <div className="truncate font-mono text-xs text-muted-foreground">
                  tom2almighty/mihob
                </div>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("settings.projectMihobDesc")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              render={
                <a href="https://github.com/tom2almighty/mihob" target="_blank" rel="noreferrer" />
              }
              nativeButton={false}
            >
              <SimpleIconSvg path={siGithub.path} className="mr-1.5 size-3.5" />
              {t("settings.openGithub")}
              <ExternalLink className="ml-1 size-3 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              render={
                <a
                  href="https://github.com/tom2almighty/mihob/releases"
                  target="_blank"
                  rel="noreferrer"
                />
              }
              nativeButton={false}
            >
              {t("settings.openReleases")}
              <ExternalLink className="ml-1 size-3 text-muted-foreground" />
            </Button>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-card p-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground">
                <SimpleIconSvg path={siGithub.path} className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">Mihomo</div>
                <div className="truncate font-mono text-xs text-muted-foreground">
                  MetaCubeX/mihomo
                </div>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("settings.projectMihomoDesc")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              render={
                <a href="https://github.com/MetaCubeX/mihomo" target="_blank" rel="noreferrer" />
              }
              nativeButton={false}
            >
              <SimpleIconSvg path={siGithub.path} className="mr-1.5 size-3.5" />
              {t("settings.openGithub")}
              <ExternalLink className="ml-1 size-3 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              render={<a href="https://wiki.metacubex.one/" target="_blank" rel="noreferrer" />}
              nativeButton={false}
            >
              <BookOpen className="mr-1.5 size-3.5" />
              {t("settings.openDocs")}
              <ExternalLink className="ml-1 size-3 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
